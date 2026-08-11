import { beforeEach, describe, expect, it } from 'vitest';
import { addMember, api, createOwnerWithOrganization } from './helpers/api.js';
import * as demoService from '../services/demoService.js';

let owner;

function asOwner(request) {
  return request.set('Authorization', `Bearer ${owner.accessToken}`);
}

beforeEach(async () => {
  owner = await createOwnerWithOrganization({
    name: 'Asha Rao',
    email: 'asha@example.com',
    organizationName: 'Asha Traders',
  });
});

describe('the concurrency demo', () => {
  it('creates the demo variant with one unit on first reset', async () => {
    const response = await asOwner(api().post('/api/demo/reset'));

    expect(response.status).toBe(200);
    expect(response.body.ready).toBe(true);
    expect(response.body.variant.quantityOnHand).toBe(1);
  });

  it('puts the unit back through the ledger rather than editing history', async () => {
    await asOwner(api().post('/api/demo/reset'));
    const state = await asOwner(api().get('/api/demo/state'));
    const variantId = state.body.variant.id;

    await asOwner(api().post('/api/inventory/adjust')).send({
      variantId,
      delta: -1,
      note: 'Spend the demo unit',
    });

    await asOwner(api().post('/api/demo/reset'));

    const ledger = await asOwner(api().get('/api/inventory/movements').query({ variantId }));
    expect(ledger.body.data[0]).toMatchObject({ delta: 1, balanceAfter: 1, reason: 'ADJUSTMENT' });
  });

  it('blocks staff from the demo endpoints', async () => {
    const staff = await addMember({
      organizationId: owner.organization.id,
      name: 'Staff Person',
      email: 'staff@example.com',
      role: 'STAFF',
    });

    const response = await api()
      .post('/api/demo/reset')
      .set('Authorization', `Bearer ${staff.accessToken}`);

    expect(response.status).toBe(403);
  });
});

describe('the unsafe endpoint', () => {
  // This is the whole point of the demo page: the same fifty requests that the
  // locked path turns into one sale oversell here, and the balance goes
  // negative because every request trusted a read nobody was holding.
  it('oversells one unit and drives stock negative', async () => {
    await asOwner(api().post('/api/demo/reset'));

    const attempts = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        demoService.placeUnsafeOrder({
          organizationId: owner.organization.id,
          actorUserId: owner.user.id,
        }),
      ),
    );

    const sold = attempts.filter((attempt) => attempt.status === 'fulfilled');
    expect(sold.length).toBeGreaterThan(1);

    const state = await asOwner(api().get('/api/demo/state'));
    expect(state.body.variant.quantityOnHand).toBeLessThan(0);
  });

  it('is reachable again once the demo is reset', async () => {
    await asOwner(api().post('/api/demo/reset'));
    const response = await asOwner(api().post('/api/demo/orders-unsafe'));

    expect(response.status).toBe(201);
    expect(response.body.orderNumber).toMatch(/^ORD-\d{8}-[0-9A-F]{8}$/);
  });
});
