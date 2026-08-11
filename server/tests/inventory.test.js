import { beforeEach, describe, expect, it } from 'vitest';
import { addMember, api, createOwnerWithOrganization } from './helpers/api.js';
import * as inventoryService from '../services/inventoryService.js';

let owner;
let staff;
let variant;

function asOwner(request) {
  return request.set('Authorization', `Bearer ${owner.accessToken}`);
}

function asStaff(request) {
  return request.set('Authorization', `Bearer ${staff.accessToken}`);
}

function receive(quantity, note) {
  return asOwner(api().post('/api/inventory/receive')).send({
    variantId: variant.id,
    quantity,
    note,
  });
}

function adjust(delta, note) {
  return asOwner(api().post('/api/inventory/adjust')).send({ variantId: variant.id, delta, note });
}

async function currentQuantity() {
  const response = await asOwner(api().get(`/api/products/${variant.productId}`));
  return response.body.variants[0].quantityOnHand;
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

  const product = await asOwner(api().post('/api/products')).send({
    sku: 'RUN-001',
    name: 'Runner',
  });
  const created = await asOwner(api().post(`/api/products/${product.body.id}/variants`)).send({
    sku: 'RUN-001-1',
    name: 'Small',
    priceCents: 49900,
    costCents: 30000,
  });
  variant = created.body;
});

describe('receiving stock', () => {
  it('records a movement and raises the quantity on hand', async () => {
    const response = await receive(25, 'Opening stock');

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ delta: 25, reason: 'RECEIPT', balanceAfter: 25 });
    expect(await currentQuantity()).toBe(25);
  });

  it('carries the running balance across several movements', async () => {
    await receive(20);
    await receive(15);
    await adjust(-5, 'Damaged in transit');

    const ledger = await asOwner(api().get('/api/inventory/movements'));
    const balances = ledger.body.data.map((movement) => movement.balanceAfter);

    // Newest first, so the ledger reads 30, 35, 20 going back in time.
    expect(balances).toEqual([30, 35, 20]);
    expect(await currentQuantity()).toBe(30);
  });

  it('rejects a quantity of zero', async () => {
    const response = await receive(0);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('adjusting stock', () => {
  it('requires a reason', async () => {
    await receive(10);

    const response = await asOwner(api().post('/api/inventory/adjust')).send({
      variantId: variant.id,
      delta: -1,
    });

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].field).toBe('note');
  });

  it('refuses an adjustment of zero', async () => {
    const response = await adjust(0, 'Nothing to see');

    expect(response.status).toBe(400);
  });

  it('will not push stock below zero, and writes nothing when it refuses', async () => {
    await receive(3);

    const response = await adjust(-10, 'Stock count correction');

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(response.body.error.details[0]).toMatchObject({ available: 3, requested: 10 });

    expect(await currentQuantity()).toBe(3);

    const ledger = await asOwner(api().get('/api/inventory/movements'));
    expect(ledger.body.total).toBe(1);
  });
});

describe('the ledger', () => {
  it('filters by reason', async () => {
    await receive(20);
    await adjust(-2, 'Sample given out');

    const response = await asOwner(
      api().get('/api/inventory/movements').query({ reason: 'RECEIPT' }),
    );

    expect(response.body.total).toBe(1);
    expect(response.body.data[0].reason).toBe('RECEIPT');
  });

  it('filters by variant', async () => {
    await receive(20);

    const response = await asOwner(
      api().get('/api/inventory/movements').query({ variantId: variant.id }),
    );

    expect(response.body.total).toBe(1);
    expect(response.body.data[0].variant.id).toBe(variant.id);
  });

  it('names the person who moved the stock', async () => {
    await receive(20);

    const response = await asOwner(api().get('/api/inventory/movements'));

    expect(response.body.data[0].createdByUser.name).toBe('Asha Rao');
  });

  it('paginates', async () => {
    await receive(5);
    await receive(5);
    await receive(5);

    const response = await asOwner(api().get('/api/inventory/movements').query({ limit: 2 }));

    expect(response.body.data).toHaveLength(2);
    expect(response.body.totalPages).toBe(2);
  });
});

describe('who can move stock', () => {
  it('lets staff read the ledger', async () => {
    await receive(10);

    const response = await asStaff(api().get('/api/inventory/movements'));

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
  });

  it('blocks staff from receiving stock', async () => {
    const response = await asStaff(api().post('/api/inventory/receive')).send({
      variantId: variant.id,
      quantity: 5,
    });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('blocks staff from adjusting stock', async () => {
    const response = await asStaff(api().post('/api/inventory/adjust')).send({
      variantId: variant.id,
      delta: -1,
      note: 'Trying it on',
    });

    expect(response.status).toBe(403);
  });
});

describe('ledger isolation', () => {
  it('hides movements from another organization', async () => {
    await receive(10);

    const rival = await createOwnerWithOrganization({
      name: 'Vikram Nair',
      email: 'vikram@example.com',
      organizationName: 'Nair Supplies',
    });

    const ledger = await api()
      .get('/api/inventory/movements')
      .set('Authorization', `Bearer ${rival.accessToken}`);
    expect(ledger.body.total).toBe(0);

    const stealing = await api()
      .post('/api/inventory/receive')
      .set('Authorization', `Bearer ${rival.accessToken}`)
      .send({ variantId: variant.id, quantity: 5 });
    expect(stealing.status).toBe(404);
  });
});

describe('concurrent movements', () => {
  // Ten receipts fired at once against one variant. The row lock in
  // lockForUpdate is what stops two of them reading the same quantityOnHand and
  // writing the same balanceAfter.
  it('keeps the running balance correct under parallel writes', async () => {
    const receipts = Array.from({ length: 10 }, () =>
      inventoryService.receiveStock({
        organizationId: owner.organization.id,
        actorUserId: owner.user.id,
        variantId: variant.id,
        quantity: 3,
        note: 'Parallel receipt',
      }),
    );

    await Promise.all(receipts);

    expect(await currentQuantity()).toBe(30);

    const ledger = await asOwner(api().get('/api/inventory/movements').query({ limit: 100 }));
    const balances = ledger.body.data
      .map((movement) => movement.balanceAfter)
      .sort((a, b) => a - b);

    expect(balances).toEqual([3, 6, 9, 12, 15, 18, 21, 24, 27, 30]);
  });
});
