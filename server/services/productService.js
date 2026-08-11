import { withTransaction } from '../config/db.js';
import * as productModel from '../models/productModel.js';
import * as variantModel from '../models/variantModel.js';
import * as categoryModel from '../models/categoryModel.js';
import * as auditLogModel from '../models/auditLogModel.js';
import { AppError } from '../utils/AppError.js';
import { uploadProductImage } from '../utils/imageUpload.js';
import { toPage, toSkipTake } from '../utils/pagination.js';

export async function list({ organizationId, page, limit, search, categoryId, isActive }) {
  const { skip, take } = toSkipTake({ page, limit });
  const filters = { search, categoryId, isActive };

  const [products, total] = await Promise.all([
    productModel.list(organizationId, { skip, take, ...filters }),
    productModel.count(organizationId, filters),
  ]);

  return toPage({ data: products, total, page, limit });
}

export async function get({ organizationId, productId }) {
  return requireProduct(organizationId, productId);
}

export async function create({ organizationId, actorUserId, ...input }) {
  await assertProductSkuIsFree(organizationId, input.sku);
  if (input.categoryId) {
    await requireCategory(organizationId, input.categoryId);
  }

  return withTransaction(async (tx) => {
    const product = await productModel.create({ organizationId, ...input }, tx);
    await auditLogModel.record(
      {
        organizationId,
        actorUserId,
        action: 'product.created',
        entityType: 'Product',
        entityId: product.id,
        after: { sku: product.sku, name: product.name },
      },
      tx,
    );
    return product;
  });
}

export async function update({ organizationId, actorUserId, productId, ...changes }) {
  const product = await requireProduct(organizationId, productId);

  if (changes.sku && changes.sku !== product.sku) {
    await assertProductSkuIsFree(organizationId, changes.sku);
  }
  if (changes.categoryId) {
    await requireCategory(organizationId, changes.categoryId);
  }

  return withTransaction(async (tx) => {
    const updated = await productModel.update(productId, organizationId, changes, tx);
    await auditLogModel.record(
      {
        organizationId,
        actorUserId,
        action: 'product.updated',
        entityType: 'Product',
        entityId: productId,
        before: { sku: product.sku, name: product.name, isActive: product.isActive },
        after: changes,
      },
      tx,
    );
    return updated;
  });
}

export async function remove({ organizationId, actorUserId, productId }) {
  const product = await requireProduct(organizationId, productId);

  // Deleting would cascade into the stock movements and leave the ledger with
  // gaps, so anything with history has to be deactivated instead.
  const movements = await productModel.countMovementsForProduct(productId, organizationId);
  if (movements > 0) {
    throw new AppError(
      'PRODUCT_HAS_HISTORY',
      409,
      'This product has stock history, so deactivate it instead of deleting it',
    );
  }

  await withTransaction(async (tx) => {
    await productModel.remove(productId, organizationId, tx);
    await auditLogModel.record(
      {
        organizationId,
        actorUserId,
        action: 'product.deleted',
        entityType: 'Product',
        entityId: productId,
        before: { sku: product.sku, name: product.name },
      },
      tx,
    );
  });
}

export async function setImage({ organizationId, actorUserId, productId, file }) {
  const product = await requireProduct(organizationId, productId);
  if (!file) {
    throw new AppError('IMAGE_REQUIRED', 400, 'Attach an image file');
  }

  // Uploaded before the transaction opens: holding a database transaction while
  // waiting on a third party is a good way to exhaust the connection pool.
  const imageUrl = await uploadProductImage(file.buffer, organizationId);

  return withTransaction(async (tx) => {
    const updated = await productModel.update(productId, organizationId, { imageUrl }, tx);
    await auditLogModel.record(
      {
        organizationId,
        actorUserId,
        action: 'product.image_updated',
        entityType: 'Product',
        entityId: productId,
        before: { imageUrl: product.imageUrl },
        after: { imageUrl },
      },
      tx,
    );
    return updated;
  });
}

export async function addVariant({ organizationId, actorUserId, productId, ...input }) {
  await requireProduct(organizationId, productId);
  await assertVariantSkuIsFree(organizationId, input.sku);

  return withTransaction(async (tx) => {
    const variant = await variantModel.create({ organizationId, productId, ...input }, tx);
    await auditLogModel.record(
      {
        organizationId,
        actorUserId,
        action: 'variant.created',
        entityType: 'ProductVariant',
        entityId: variant.id,
        after: { sku: variant.sku, name: variant.name, priceCents: variant.priceCents },
      },
      tx,
    );
    return variant;
  });
}

export async function updateVariant({ organizationId, actorUserId, variantId, ...changes }) {
  const variant = await requireVariant(organizationId, variantId);

  if (changes.sku && changes.sku !== variant.sku) {
    await assertVariantSkuIsFree(organizationId, changes.sku);
  }

  return withTransaction(async (tx) => {
    const updated = await variantModel.update(variantId, organizationId, changes, tx);
    await auditLogModel.record(
      {
        organizationId,
        actorUserId,
        action: 'variant.updated',
        entityType: 'ProductVariant',
        entityId: variantId,
        before: {
          sku: variant.sku,
          name: variant.name,
          priceCents: variant.priceCents,
          costCents: variant.costCents,
        },
        after: changes,
      },
      tx,
    );
    return updated;
  });
}

export async function removeVariant({ organizationId, actorUserId, variantId }) {
  const variant = await requireVariant(organizationId, variantId);

  const movements = await variantModel.countMovements(variantId, organizationId);
  if (movements > 0) {
    throw new AppError(
      'VARIANT_HAS_HISTORY',
      409,
      'This variant has stock history and cannot be deleted',
    );
  }

  await withTransaction(async (tx) => {
    await variantModel.remove(variantId, organizationId, tx);
    await auditLogModel.record(
      {
        organizationId,
        actorUserId,
        action: 'variant.deleted',
        entityType: 'ProductVariant',
        entityId: variantId,
        before: { sku: variant.sku, name: variant.name },
      },
      tx,
    );
  });
}

async function requireProduct(organizationId, productId) {
  const product = await productModel.findById(productId, organizationId);
  if (!product) {
    throw new AppError('NOT_FOUND', 404, 'Product not found');
  }
  return product;
}

async function requireVariant(organizationId, variantId) {
  const variant = await variantModel.findById(variantId, organizationId);
  if (!variant) {
    throw new AppError('NOT_FOUND', 404, 'Variant not found');
  }
  return variant;
}

async function requireCategory(organizationId, categoryId) {
  if (!(await categoryModel.findById(categoryId, organizationId))) {
    throw new AppError('NOT_FOUND', 404, 'Category not found');
  }
}

async function assertProductSkuIsFree(organizationId, sku) {
  if (await productModel.findBySku(sku, organizationId)) {
    throw new AppError('SKU_TAKEN', 409, 'A product with that SKU already exists');
  }
}

async function assertVariantSkuIsFree(organizationId, sku) {
  if (await variantModel.findBySku(sku, organizationId)) {
    throw new AppError('SKU_TAKEN', 409, 'A variant with that SKU already exists');
  }
}
