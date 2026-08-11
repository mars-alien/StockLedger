import crypto from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { addMember, api, createOwnerWithOrganization } from './helpers/api.js';

let owner;
let variant;

function asOwner(request) {
  return request.set('Authorization', `Bearer ${owner.accessToken}`);
}

function placeOrder(quantity) {
  return api()
    .post('/api/orders')
    .set('Authorization', `Bearer ${owner.accessToken}`)
    .set('Idempotency-Key', crypto.randomUUID())
    .send({ customerName: 'Ananya Krishnan', lines: [{ variantId: variant.id, quantity }] });
}

beforeEach(async () => {
  owner = await createOwnerWithOrganization({
    name: 'Asha Rao',
    email: 'asha@example.com',
    organizationName: 'Asha Traders',
  });

  const product = await asOwner(api().post('/api/products')).send({
    sku: 'ANA-001',
    name: 'Analysed thing',
  });
  const created = await asOwner(api().post(`/api/products/${product.body.id}/variants`)).send({
    sku: 'ANA-001-1',
    name: 'Default',
    priceCents: 100_000,
    costCents: 50_000,
  });
  variant = created.body;

  await asOwner(api().post('/api/inventory/receive')).send({ variantId: variant.id, quantity: 50 });
});

describe('the dashboard', () => {
  it('is empty but well formed before anything sells', async () => {
    const response = await asOwner(api().get('/api/analytics/dashboard').query({ days: 30 }));

    expect(response.status).toBe(200);
    expect(response.body.totals).toMatchObject({
      orders: 0,
      revenueCents: 0,
      unitsSold: 0,
      averageOrderCents: 0,
    });
    expect(response.body.topProducts).toEqual([]);
  });

  it('adds up revenue, tax and units from real orders', async () => {
    await placeOrder(2);
    await placeOrder(3);

    const response = await asOwner(api().get('/api/analytics/dashboard').query({ days: 30 }));

    // Five units at 1000.00 each, plus 18% tax.
    expect(response.body.totals).toMatchObject({
      orders: 2,
      subtotalCents: 500_000,
      taxCents: 90_000,
      revenueCents: 590_000,
      unitsSold: 5,
      averageOrderCents: 295_000,
    });
  });

  it('leaves cancelled orders out of the numbers', async () => {
    const placed = await placeOrder(2);
    await placeOrder(1);
    await asOwner(api().post(`/api/orders/${placed.body.id}/cancel`)).send({});

    const response = await asOwner(api().get('/api/analytics/dashboard').query({ days: 30 }));

    expect(response.body.totals.orders).toBe(1);
    expect(response.body.totals.unitsSold).toBe(1);
  });

  it('counts paid revenue separately from placed revenue', async () => {
    await placeOrder(1);

    const before = await asOwner(api().get('/api/analytics/dashboard').query({ days: 30 }));
    expect(before.body.totals.paidOrders).toBe(0);
    expect(before.body.totals.paidRevenueCents).toBe(0);
    expect(before.body.totals.revenueCents).toBe(118_000);
  });

  it('gives every day in the range a point, including the quiet ones', async () => {
    await placeOrder(1);

    const response = await asOwner(api().get('/api/analytics/dashboard').query({ days: 7 }));

    expect(response.body.trend).toHaveLength(8);
    expect(response.body.trend.every((point) => typeof point.revenueCents === 'number')).toBe(true);
    expect(response.body.trend.at(-1).orders).toBe(1);
  });

  it('ranks top products by revenue', async () => {
    await placeOrder(4);

    const response = await asOwner(api().get('/api/analytics/dashboard').query({ days: 30 }));

    expect(response.body.topProducts).toHaveLength(1);
    expect(response.body.topProducts[0]).toMatchObject({
      name: 'Analysed thing',
      units: 4,
      revenueCents: 400_000,
    });
  });

  it('keeps another organization figures out of the totals', async () => {
    await placeOrder(2);

    const rival = await createOwnerWithOrganization({
      name: 'Vikram Nair',
      email: 'vikram@example.com',
      organizationName: 'Nair Supplies',
    });

    const response = await api()
      .get('/api/analytics/dashboard')
      .query({ days: 30 })
      .set('Authorization', `Bearer ${rival.accessToken}`);

    expect(response.body.totals.orders).toBe(0);
    expect(response.body.totals.revenueCents).toBe(0);
  });

  it('is closed to staff', async () => {
    const staff = await addMember({
      organizationId: owner.organization.id,
      name: 'Staff Person',
      email: 'staff@example.com',
      role: 'STAFF',
    });

    const response = await api()
      .get('/api/analytics/dashboard')
      .set('Authorization', `Bearer ${staff.accessToken}`);

    expect(response.status).toBe(403);
  });
});
