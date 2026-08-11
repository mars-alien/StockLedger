import { withTransaction } from '../config/db.js';
import * as categoryModel from '../models/categoryModel.js';
import * as auditLogModel from '../models/auditLogModel.js';
import { AppError } from '../utils/AppError.js';
import { toPage, toSkipTake } from '../utils/pagination.js';
import { toSlug } from '../utils/slug.js';

export async function list({ organizationId, page, limit, search }) {
  const { skip, take } = toSkipTake({ page, limit });
  const [categories, total] = await Promise.all([
    categoryModel.list(organizationId, { skip, take, search }),
    categoryModel.count(organizationId, { search }),
  ]);

  return toPage({ data: categories, total, page, limit });
}

export async function create({ organizationId, actorUserId, name }) {
  const slug = toSlug(name);
  await assertSlugIsFree(organizationId, slug);

  return withTransaction(async (tx) => {
    const category = await categoryModel.create({ organizationId, name, slug }, tx);
    await auditLogModel.record(
      {
        organizationId,
        actorUserId,
        action: 'category.created',
        entityType: 'Category',
        entityId: category.id,
        after: { name, slug },
      },
      tx,
    );
    return category;
  });
}

export async function update({ organizationId, actorUserId, categoryId, name }) {
  const category = await requireCategory(organizationId, categoryId);
  const slug = toSlug(name);

  if (slug !== category.slug) {
    await assertSlugIsFree(organizationId, slug);
  }

  return withTransaction(async (tx) => {
    const updated = await categoryModel.update(categoryId, organizationId, { name, slug }, tx);
    await auditLogModel.record(
      {
        organizationId,
        actorUserId,
        action: 'category.updated',
        entityType: 'Category',
        entityId: categoryId,
        before: { name: category.name, slug: category.slug },
        after: { name, slug },
      },
      tx,
    );
    return updated;
  });
}

export async function remove({ organizationId, actorUserId, categoryId }) {
  const category = await requireCategory(organizationId, categoryId);

  // Products outlive their category: the schema sets categoryId to null rather
  // than deleting stock along with a bit of filing.
  await withTransaction(async (tx) => {
    await categoryModel.remove(categoryId, organizationId, tx);
    await auditLogModel.record(
      {
        organizationId,
        actorUserId,
        action: 'category.deleted',
        entityType: 'Category',
        entityId: categoryId,
        before: { name: category.name, slug: category.slug },
      },
      tx,
    );
  });
}

async function requireCategory(organizationId, categoryId) {
  const category = await categoryModel.findById(categoryId, organizationId);
  if (!category) {
    throw new AppError('NOT_FOUND', 404, 'Category not found');
  }
  return category;
}

async function assertSlugIsFree(organizationId, slug) {
  if (await categoryModel.findBySlug(slug, organizationId)) {
    throw new AppError('CATEGORY_EXISTS', 409, 'A category with that name already exists');
  }
}
