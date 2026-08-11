import crypto from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { addMember, api, createOwnerWithOrganization } from './helpers/api.js';
import * as orderModel from '../models/orderModel.js';
import * as idempotencyKeyModel from '../models/idempotencyKeyModel.js';

let owner;
let staff;
let variant;
let secondVariant;

function asOwner(request) {
  return request.set('Authorization', `Bearer ${owner.accessToken}`);
}

function placeOrder(lines, { token = owner.accessToken, key = crypto.randomUUID() } = {}) {
  return api()
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', key)
    .send({ customerName: 'Walk-in customer', lines });
}

async function createVariantWithStock({ sku, priceCents, quantity }) {
  const product = await asOwner(api().post('/api/products')).send({ sku, name: `Product ${sku}` });
  const created = await asOwner(api().post(`/api/products/${product.body.id}/variants`)).send({
    sku: `${sku}-1`,
    name: 'Default',
    priceCents,
    costCents: Math.round(priceCents / 2),
  });

  if (quantity > 0) {
    await asOwner(api().post('/api/inventory/receive')).send({
      variantId: created.body.id,
      quantity,
    });
  }
  return created.body;
}

async function stockOf(variantId) {
  const response = await asOwner(api().get('/api/inventory/variants').query({ limit: 100 }));
  return response.body.data.find((row) => row.id === variantId).quantityOnHand;
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

  variant = await createVariantWithStock({ sku: 'RUN-001', priceCents: 10_000, quantity: 10 });
  secondVariant = await createVariantWithStock({ sku: 'LMP-001', priceCents: 25_000, quantity: 4 });
});

describe('placing an order', () => {
  it('prices the lines, adds tax and decrements stock', async () => {
    const response = await placeOrder([
      { variantId: variant.id, quantity: 2 },
      { variantId: secondVariant.id, quantity: 1 },
    ]);

    expect(response.status).toBe(201);
    expect(response.body.subtotalCents).toBe(45_000);
    expect(response.body.taxCents).toBe(8_100);
    expect(response.body.totalCents).toBe(53_100);
    expect(response.body.status).toBe('PLACED');
    expect(response.body.paymentStatus).toBe('UNPAID');

    expect(await stockOf(variant.id)).toBe(8);
    expect(await stockOf(secondVariant.id)).toBe(3);
  });

  it('writes a SALE movement per line with the running balance', async () => {
    await placeOrder([{ variantId: variant.id, quantity: 3 }]);

    const ledger = await asOwner(
      api().get('/api/inventory/movements').query({ reason: 'SALE', variantId: variant.id }),
    );

    expect(ledger.body.total).toBe(1);
    expect(ledger.body.data[0]).toMatchObject({ delta: -3, balanceAfter: 7 });
  });

  // The order detail page asks the ledger for this order's movements, so a
  // movement that forgot which order caused it looks like it never happened.
  it('ties every movement back to the order that caused it', async () => {
    const placed = await placeOrder([
      { variantId: variant.id, quantity: 2 },
      { variantId: secondVariant.id, quantity: 1 },
    ]);

    const sales = await asOwner(
      api().get('/api/inventory/movements').query({ orderId: placed.body.id }),
    );
    expect(sales.body.total).toBe(2);

    await asOwner(api().post(`/api/orders/${placed.body.id}/cancel`)).send({});

    const all = await asOwner(
      api().get('/api/inventory/movements').query({ orderId: placed.body.id, limit: 100 }),
    );
    expect(all.body.total).toBe(4);
    expect(all.body.data.filter((row) => row.reason === 'CANCELLATION')).toHaveLength(2);
  });

  it('combines a variant that appears twice into one line', async () => {
    const response = await placeOrder([
      { variantId: variant.id, quantity: 2 },
      { variantId: variant.id, quantity: 3 },
    ]);

    expect(response.status).toBe(201);
    expect(response.body.lines).toHaveLength(1);
    expect(response.body.lines[0].quantity).toBe(5);
    expect(await stockOf(variant.id)).toBe(5);
  });

  it('refuses the whole order when one line is short', async () => {
    const response = await placeOrder([
      { variantId: variant.id, quantity: 2 },
      { variantId: secondVariant.id, quantity: 99 },
    ]);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('OUT_OF_STOCK');
    expect(response.body.error.details).toEqual([
      { variantId: secondVariant.id, requested: 99, available: 4 },
    ]);

    // Nothing was partially applied: the line that could have been filled wasn't.
    expect(await stockOf(variant.id)).toBe(10);
    expect(await stockOf(secondVariant.id)).toBe(4);
  });

  it('lets staff place an order', async () => {
    const response = await placeOrder([{ variantId: variant.id, quantity: 1 }], {
      token: staff.accessToken,
    });

    expect(response.status).toBe(201);
  });
});

describe('idempotency', () => {
  it('rejects a request with no Idempotency-Key', async () => {
    const response = await api()
      .post('/api/orders')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ customerName: 'Walk-in customer', lines: [{ variantId: variant.id, quantity: 1 }] });

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].field).toBe('idempotency-key');
  });

  it('rejects a key that is not a uuid', async () => {
    const response = await placeOrder([{ variantId: variant.id, quantity: 1 }], { key: 'nope' });

    expect(response.status).toBe(400);
  });

  it('replays the first response instead of placing a second order', async () => {
    const key = crypto.randomUUID();
    const lines = [{ variantId: variant.id, quantity: 2 }];

    const first = await placeOrder(lines, { key });
    const second = await placeOrder(lines, { key });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers['idempotency-replayed']).toBe('true');
    expect(second.body.id).toBe(first.body.id);

    // One order, one decrement.
    expect(await stockOf(variant.id)).toBe(8);

    const orders = await asOwner(api().get('/api/orders'));
    expect(orders.body.total).toBe(1);
  });

  it('replays a refusal too, rather than retrying the work', async () => {
    const key = crypto.randomUUID();
    const lines = [{ variantId: variant.id, quantity: 999 }];

    const first = await placeOrder(lines, { key });
    const second = await placeOrder(lines, { key });

    expect(first.status).toBe(409);
    expect(second.status).toBe(409);
    expect(second.headers['idempotency-replayed']).toBe('true');
    expect(second.body.error.code).toBe('OUT_OF_STOCK');
  });

  it('refuses a key that was used for a different order', async () => {
    const key = crypto.randomUUID();

    await placeOrder([{ variantId: variant.id, quantity: 1 }], { key });
    const response = await placeOrder([{ variantId: variant.id, quantity: 2 }], { key });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('prunes keys once they are too old for anyone to retry with', async () => {
    const key = crypto.randomUUID();
    const lines = [{ variantId: variant.id, quantity: 1 }];

    await placeOrder(lines, { key });

    // Everything written so far counts as old.
    const { count } = await idempotencyKeyModel.deleteOlderThan(new Date(Date.now() + 1000));
    expect(count).toBe(1);

    // With the key swept up the same request is a new order, not a replay.
    const again = await placeOrder(lines, { key });
    expect(again.status).toBe(201);
    expect(again.headers['idempotency-replayed']).toBe('false');
    expect(await stockOf(variant.id)).toBe(8);
  });

  it('treats line order as the same request', async () => {
    const key = crypto.randomUUID();

    const first = await placeOrder(
      [
        { variantId: variant.id, quantity: 1 },
        { variantId: secondVariant.id, quantity: 1 },
      ],
      { key },
    );
    const second = await placeOrder(
      [
        { variantId: secondVariant.id, quantity: 1 },
        { variantId: variant.id, quantity: 1 },
      ],
      { key },
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
  });
});

describe('overselling', () => {
  it('gives exactly one winner when fifty orders chase one unit', async () => {
    const single = await createVariantWithStock({
      sku: 'LAST-001',
      priceCents: 99_900,
      quantity: 1,
    });

    const attempts = await Promise.all(
      Array.from({ length: 50 }, () => placeOrder([{ variantId: single.id, quantity: 1 }])),
    );

    const created = attempts.filter((response) => response.status === 201);
    const outOfStock = attempts.filter((response) => response.status === 409);

    expect(created).toHaveLength(1);
    expect(outOfStock).toHaveLength(49);
    expect(outOfStock.every((response) => response.body.error.code === 'OUT_OF_STOCK')).toBe(true);

    expect(await stockOf(single.id)).toBe(0);

    const ledger = await asOwner(
      api().get('/api/inventory/movements').query({ variantId: single.id, limit: 100 }),
    );
    const sales = ledger.body.data.filter((movement) => movement.reason === 'SALE');
    expect(sales).toHaveLength(1);
    expect(sales[0].balanceAfter).toBe(0);
  });

  it('never lets the balance go below zero across overlapping orders', async () => {
    const scarce = await createVariantWithStock({
      sku: 'FEW-001',
      priceCents: 5_000,
      quantity: 12,
    });

    const attempts = await Promise.all(
      Array.from({ length: 20 }, () => placeOrder([{ variantId: scarce.id, quantity: 2 }])),
    );

    const created = attempts.filter((response) => response.status === 201);

    expect(created).toHaveLength(6);
    expect(await stockOf(scarce.id)).toBe(0);

    const ledger = await asOwner(
      api().get('/api/inventory/movements').query({ variantId: scarce.id, limit: 100 }),
    );
    const balances = ledger.body.data.map((movement) => movement.balanceAfter);
    expect(Math.min(...balances)).toBeGreaterThanOrEqual(0);
  });
});

describe('cancelling an order', () => {
  it('returns the stock and writes CANCELLATION movements', async () => {
    const placed = await placeOrder([{ variantId: variant.id, quantity: 4 }]);
    expect(await stockOf(variant.id)).toBe(6);

    const response = await asOwner(api().post(`/api/orders/${placed.body.id}/cancel`)).send({
      note: 'Customer changed their mind',
    });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('CANCELLED');
    expect(await stockOf(variant.id)).toBe(10);

    const ledger = await asOwner(
      api().get('/api/inventory/movements').query({ reason: 'CANCELLATION' }),
    );
    expect(ledger.body.data[0]).toMatchObject({ delta: 4, balanceAfter: 10 });
  });

  it('refuses to cancel twice', async () => {
    const placed = await placeOrder([{ variantId: variant.id, quantity: 1 }]);
    await asOwner(api().post(`/api/orders/${placed.body.id}/cancel`)).send({});

    const response = await asOwner(api().post(`/api/orders/${placed.body.id}/cancel`)).send({});

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ORDER_ALREADY_CANCELLED');
  });

  // paymentStatus is the only field that decides this. OrderStatus has no PAID
  // value at all, so there is no second opinion to disagree with.
  it('refuses to cancel an order that has been paid', async () => {
    const placed = await placeOrder([{ variantId: variant.id, quantity: 1 }]);
    await orderModel.update(placed.body.id, owner.organization.id, { paymentStatus: 'PAID' });

    const response = await asOwner(api().post(`/api/orders/${placed.body.id}/cancel`)).send({});

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ORDER_ALREADY_PAID');
    expect(await stockOf(variant.id)).toBe(9);
  });

  it('blocks staff from cancelling', async () => {
    const placed = await placeOrder([{ variantId: variant.id, quantity: 1 }]);

    const response = await api()
      .post(`/api/orders/${placed.body.id}/cancel`)
      .set('Authorization', `Bearer ${staff.accessToken}`)
      .send({});

    expect(response.status).toBe(403);
  });
});

describe('order isolation', () => {
  it('hides orders from another organization', async () => {
    const placed = await placeOrder([{ variantId: variant.id, quantity: 1 }]);

    const rival = await createOwnerWithOrganization({
      name: 'Vikram Nair',
      email: 'vikram@example.com',
      organizationName: 'Nair Supplies',
    });

    const list = await api().get('/api/orders').set('Authorization', `Bearer ${rival.accessToken}`);
    expect(list.body.total).toBe(0);

    const detail = await api()
      .get(`/api/orders/${placed.body.id}`)
      .set('Authorization', `Bearer ${rival.accessToken}`);
    expect(detail.status).toBe(404);
  });

  it('will not sell another organization stock', async () => {
    const rival = await createOwnerWithOrganization({
      name: 'Vikram Nair',
      email: 'vikram@example.com',
      organizationName: 'Nair Supplies',
    });

    const response = await placeOrder([{ variantId: variant.id, quantity: 1 }], {
      token: rival.accessToken,
    });

    expect(response.status).toBe(404);
  });
});
