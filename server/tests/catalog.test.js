import { beforeEach, describe, expect, it } from 'vitest';
import { addMember, api, createOwnerWithOrganization } from './helpers/api.js';

let owner;
let staff;

function asOwner(request) {
  return request.set('Authorization', `Bearer ${owner.accessToken}`);
}

async function createCategory(name) {
  const response = await asOwner(api().post('/api/categories')).send({ name });
  return response.body;
}

async function createProduct({ sku, name, categoryId }) {
  const response = await asOwner(api().post('/api/products')).send({ sku, name, categoryId });
  return response.body;
}

async function createVariant(productId, overrides = {}) {
  const response = await asOwner(api().post(`/api/products/${productId}/variants`)).send({
    sku: `VAR-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Default',
    priceCents: 49900,
    costCents: 30000,
    ...overrides,
  });
  return response.body;
}

beforeEach(async () => {
  owner = await createOwnerWithOrganization({
    name: 'Asha Rao',
    email: 'asha@example.com',
    organizationName: 'Asha Traders',
  });
  staff = await addMember({
    organizationId: owner.organization.id,
    name: 'Staff Person',
    email: 'staff@example.com',
    role: 'STAFF',
  });
});

describe('categories', () => {
  it('creates a category with a slug derived from the name', async () => {
    const response = await asOwner(api().post('/api/categories')).send({ name: 'Running Shoes' });

    expect(response.status).toBe(201);
    expect(response.body.slug).toBe('running-shoes');
  });

  it('refuses a second category with the same name', async () => {
    await createCategory('Footwear');

    const response = await asOwner(api().post('/api/categories')).send({ name: 'Footwear' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CATEGORY_EXISTS');
  });

  it('paginates the list', async () => {
    await createCategory('Footwear');
    await createCategory('Apparel');
    await createCategory('Grocery');

    const response = await asOwner(api().get('/api/categories').query({ limit: 2 }));

    expect(response.body.data).toHaveLength(2);
    expect(response.body).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2 });
  });

  it('renames a category', async () => {
    const category = await createCategory('Footwear');

    const response = await asOwner(api().patch(`/api/categories/${category.id}`)).send({
      name: 'Shoes',
    });

    expect(response.status).toBe(200);
    expect(response.body.slug).toBe('shoes');
  });

  it('leaves products behind when a category is deleted', async () => {
    const category = await createCategory('Footwear');
    const product = await createProduct({ sku: 'SKU-1', name: 'Runner', categoryId: category.id });

    const deleted = await asOwner(api().delete(`/api/categories/${category.id}`));
    expect(deleted.status).toBe(204);

    const detail = await asOwner(api().get(`/api/products/${product.id}`));
    expect(detail.status).toBe(200);
    expect(detail.body.category).toBeNull();
  });

  it('lets staff read but not write', async () => {
    const readable = await api()
      .get('/api/categories')
      .set('Authorization', `Bearer ${staff.accessToken}`);
    expect(readable.status).toBe(200);

    const writable = await api()
      .post('/api/categories')
      .set('Authorization', `Bearer ${staff.accessToken}`)
      .send({ name: 'Footwear' });

    expect(writable.status).toBe(403);
    expect(writable.body.error.code).toBe('FORBIDDEN');
  });
});

describe('products', () => {
  it('creates a product and reads it back with its variants', async () => {
    const product = await createProduct({ sku: 'RUN-001', name: 'Runner' });
    await createVariant(product.id, { sku: 'RUN-001-1', name: 'Small' });
    await createVariant(product.id, { sku: 'RUN-001-2', name: 'Large' });

    const response = await asOwner(api().get(`/api/products/${product.id}`));

    expect(response.status).toBe(200);
    expect(response.body.variants).toHaveLength(2);
    expect(response.body.variants[0].quantityOnHand).toBe(0);
  });

  it('refuses a duplicate sku', async () => {
    await createProduct({ sku: 'RUN-001', name: 'Runner' });

    const response = await asOwner(api().post('/api/products')).send({
      sku: 'RUN-001',
      name: 'Another Runner',
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('SKU_TAKEN');
  });

  it('searches by name and by sku', async () => {
    await createProduct({ sku: 'RUN-001', name: 'Runner' });
    await createProduct({ sku: 'LMP-001', name: 'Table Lamp' });

    const byName = await asOwner(api().get('/api/products').query({ search: 'lamp' }));
    expect(byName.body.total).toBe(1);

    const bySku = await asOwner(api().get('/api/products').query({ search: 'RUN' }));
    expect(bySku.body.total).toBe(1);
  });

  it('filters by category and by active flag', async () => {
    const category = await createCategory('Footwear');
    const runner = await createProduct({ sku: 'RUN-001', name: 'Runner', categoryId: category.id });
    await createProduct({ sku: 'LMP-001', name: 'Table Lamp' });

    const filtered = await asOwner(api().get('/api/products').query({ categoryId: category.id }));
    expect(filtered.body.total).toBe(1);

    await asOwner(api().patch(`/api/products/${runner.id}`)).send({ isActive: false });

    const active = await asOwner(api().get('/api/products').query({ isActive: 'true' }));
    expect(active.body.total).toBe(1);
    expect(active.body.data[0].sku).toBe('LMP-001');
  });

  it('rejects an update with no fields', async () => {
    const product = await createProduct({ sku: 'RUN-001', name: 'Runner' });

    const response = await asOwner(api().patch(`/api/products/${product.id}`)).send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('deletes a product that has no stock history', async () => {
    const product = await createProduct({ sku: 'RUN-001', name: 'Runner' });

    const response = await asOwner(api().delete(`/api/products/${product.id}`));

    expect(response.status).toBe(204);
  });

  it('refuses to delete a product once stock has moved', async () => {
    const product = await createProduct({ sku: 'RUN-001', name: 'Runner' });
    const variant = await createVariant(product.id);
    await asOwner(api().post('/api/inventory/receive')).send({
      variantId: variant.id,
      quantity: 5,
    });

    const response = await asOwner(api().delete(`/api/products/${product.id}`));

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('PRODUCT_HAS_HISTORY');
  });

  it('blocks staff from creating products', async () => {
    const response = await api()
      .post('/api/products')
      .set('Authorization', `Bearer ${staff.accessToken}`)
      .send({ sku: 'RUN-001', name: 'Runner' });

    expect(response.status).toBe(403);
  });
});

describe('variants', () => {
  it('rejects a fractional price', async () => {
    const product = await createProduct({ sku: 'RUN-001', name: 'Runner' });

    const response = await asOwner(api().post(`/api/products/${product.id}/variants`)).send({
      sku: 'RUN-001-1',
      name: 'Small',
      priceCents: 499.5,
      costCents: 30000,
    });

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].field).toBe('priceCents');
  });

  it('updates a price', async () => {
    const product = await createProduct({ sku: 'RUN-001', name: 'Runner' });
    const variant = await createVariant(product.id);

    const response = await asOwner(
      api().patch(`/api/products/${product.id}/variants/${variant.id}`),
    ).send({ priceCents: 59900 });

    expect(response.status).toBe(200);
    expect(response.body.priceCents).toBe(59900);
  });

  it('refuses to delete a variant once stock has moved', async () => {
    const product = await createProduct({ sku: 'RUN-001', name: 'Runner' });
    const variant = await createVariant(product.id);
    await asOwner(api().post('/api/inventory/receive')).send({
      variantId: variant.id,
      quantity: 5,
    });

    const response = await asOwner(
      api().delete(`/api/products/${product.id}/variants/${variant.id}`),
    );

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('VARIANT_HAS_HISTORY');
  });
});

describe('catalog isolation', () => {
  it('keeps another organization catalog out of the list and out of reach', async () => {
    const product = await createProduct({ sku: 'RUN-001', name: 'Runner' });

    const rival = await createOwnerWithOrganization({
      name: 'Vikram Nair',
      email: 'vikram@example.com',
      organizationName: 'Nair Supplies',
    });

    const list = await api()
      .get('/api/products')
      .set('Authorization', `Bearer ${rival.accessToken}`);
    expect(list.body.total).toBe(0);

    const detail = await api()
      .get(`/api/products/${product.id}`)
      .set('Authorization', `Bearer ${rival.accessToken}`);
    expect(detail.status).toBe(404);

    const edit = await api()
      .patch(`/api/products/${product.id}`)
      .set('Authorization', `Bearer ${rival.accessToken}`)
      .send({ name: 'Stolen' });
    expect(edit.status).toBe(404);
  });

  it('will not attach a product to another organization category', async () => {
    const category = await createCategory('Footwear');

    const rival = await createOwnerWithOrganization({
      name: 'Vikram Nair',
      email: 'vikram@example.com',
      organizationName: 'Nair Supplies',
    });

    const response = await api()
      .post('/api/products')
      .set('Authorization', `Bearer ${rival.accessToken}`)
      .send({ sku: 'RUN-001', name: 'Runner', categoryId: category.id });

    expect(response.status).toBe(404);
  });
});
