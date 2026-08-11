import crypto from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { api, createOwnerWithOrganization } from './helpers/api.js';
import * as orderModel from '../models/orderModel.js';
import * as paymentService from '../services/paymentService.js';

let owner;
let order;

function asOwner(request) {
  return request.set('Authorization', `Bearer ${owner.accessToken}`);
}

async function placeOrder() {
  const product = await asOwner(api().post('/api/products')).send({
    sku: 'PAY-001',
    name: 'Payable thing',
  });
  const variant = await asOwner(api().post(`/api/products/${product.body.id}/variants`)).send({
    sku: 'PAY-001-1',
    name: 'Default',
    priceCents: 120_000,
    costCents: 60_000,
  });
  await asOwner(api().post('/api/inventory/receive')).send({
    variantId: variant.body.id,
    quantity: 5,
  });

  const placed = await api()
    .post('/api/orders')
    .set('Authorization', `Bearer ${owner.accessToken}`)
    .set('Idempotency-Key', crypto.randomUUID())
    .send({
      customerName: 'Ananya Krishnan',
      lines: [{ variantId: variant.body.id, quantity: 2 }],
    });

  return placed.body;
}

beforeEach(async () => {
  owner = await createOwnerWithOrganization({
    name: 'Asha Rao',
    email: 'asha@example.com',
    organizationName: 'Asha Traders',
  });
  order = await placeOrder();
});

describe('when Razorpay is not configured', () => {
  // The suite runs with empty keys, which is also how a fresh clone runs. The
  // catalog and invoices have to keep working regardless.
  it('answers 503 rather than failing in an unexplained way', async () => {
    const response = await asOwner(api().post(`/api/payments/orders/${order.id}/intent`));

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('PAYMENTS_UNAVAILABLE');
  });

  it('refuses a webhook it cannot verify', async () => {
    const response = await api()
      .post('/api/payments/webhook')
      .set('x-razorpay-signature', 'nonsense')
      .send({ event: 'payment.captured' });

    expect(response.status).toBe(503);
  });
});

describe('webhook signatures', () => {
  const secret = 'webhook-secret-for-tests';

  function sign(body) {
    return crypto.createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');
  }

  it('rejects a body whose signature does not match', async () => {
    await expect(
      paymentService.handleWebhook({
        rawBody: Buffer.from(JSON.stringify({ event: 'payment.captured' })),
        signature: 'not-the-right-mac',
      }),
    ).rejects.toMatchObject({ code: 'PAYMENTS_UNAVAILABLE' });

    // With a secret present the same bad signature is a 400 rather than a 503.
    const body = { event: 'payment.captured' };
    await expect(
      withSecret(secret, () =>
        paymentService.handleWebhook({
          rawBody: Buffer.from(JSON.stringify(body)),
          signature: 'not-the-right-mac',
        }),
      ),
    ).rejects.toMatchObject({ code: 'PAYMENT_SIGNATURE_INVALID', statusCode: 400 });
  });

  // A 500 here would be worse than it looks: Razorpay retries a 5xx forever, so
  // a request it can never get right has to be refused once and for good.
  it('refuses a body that never arrived as json, without a 500', async () => {
    await expect(
      withSecret(secret, () =>
        paymentService.handleWebhook({ rawBody: undefined, signature: 'anything' }),
      ),
    ).rejects.toMatchObject({ code: 'PAYMENT_SIGNATURE_INVALID', statusCode: 400 });

    await expect(
      withSecret(secret, () =>
        paymentService.handleWebhook({ rawBody: Buffer.alloc(0), signature: 'anything' }),
      ),
    ).rejects.toMatchObject({ code: 'PAYMENT_SIGNATURE_INVALID', statusCode: 400 });
  });

  it('marks the order paid when the signature verifies', async () => {
    await orderModel.update(order.id, owner.organization.id, { razorpayOrderId: 'order_TEST123' });

    const body = {
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_TEST123', order_id: 'order_TEST123' } } },
    };

    const result = await withSecret(secret, () =>
      paymentService.handleWebhook({
        rawBody: Buffer.from(JSON.stringify(body)),
        signature: sign(body),
      }),
    );

    expect(result.handled).toBe(true);

    const detail = await asOwner(api().get(`/api/orders/${order.id}`));
    expect(detail.body.paymentStatus).toBe('PAID');
    expect(detail.body.razorpayPaymentId).toBe('pay_TEST123');
  });

  it('is safe to deliver twice', async () => {
    await orderModel.update(order.id, owner.organization.id, { razorpayOrderId: 'order_TEST456' });

    const body = {
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_TEST456', order_id: 'order_TEST456' } } },
    };
    const deliver = () =>
      withSecret(secret, () =>
        paymentService.handleWebhook({
          rawBody: Buffer.from(JSON.stringify(body)),
          signature: sign(body),
        }),
      );

    await deliver();
    await deliver();

    const audit = await asOwner(api().get(`/api/orders/${order.id}`));
    expect(audit.body.paymentStatus).toBe('PAID');
  });

  // Razorpay cannot void an order, so an intent raised before a cancellation
  // stays payable. Recording that as a normal payment would leave an order that
  // is cancelled, paid, and has already put its stock back.
  it('will not mark a cancelled order paid', async () => {
    await orderModel.update(order.id, owner.organization.id, {
      razorpayOrderId: 'order_CANCELLED1',
    });
    await asOwner(api().post(`/api/orders/${order.id}/cancel`)).send({});

    const body = {
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_LATE', order_id: 'order_CANCELLED1' } } },
    };

    const result = await withSecret(secret, () =>
      paymentService.handleWebhook({
        rawBody: Buffer.from(JSON.stringify(body)),
        signature: sign(body),
      }),
    );

    // Acknowledged so Razorpay stops retrying, but not treated as paid.
    expect(result.handled).toBe(false);

    const detail = await asOwner(api().get(`/api/orders/${order.id}`));
    expect(detail.body.status).toBe('CANCELLED');
    expect(detail.body.paymentStatus).toBe('UNPAID');
    expect(detail.body.razorpayPaymentId).toBeNull();
  });

  it('ignores events it does not act on', async () => {
    const body = { event: 'payment.authorized', payload: {} };

    const result = await withSecret(secret, () =>
      paymentService.handleWebhook({
        rawBody: Buffer.from(JSON.stringify(body)),
        signature: sign(body),
      }),
    );

    expect(result.handled).toBe(false);
  });
});

describe('a paid order', () => {
  it('cannot be cancelled', async () => {
    await orderModel.update(order.id, owner.organization.id, { paymentStatus: 'PAID' });

    const response = await asOwner(api().post(`/api/orders/${order.id}/cancel`)).send({});

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ORDER_ALREADY_PAID');
  });
});

describe('invoices', () => {
  it('downloads as a pdf regardless of whether payments are configured', async () => {
    const response = await asOwner(api().get(`/api/orders/${order.id}/invoice`));

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toContain(`invoice-${order.orderNumber}.pdf`);
    expect(response.body.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('will not hand over another organization invoice', async () => {
    const rival = await createOwnerWithOrganization({
      name: 'Vikram Nair',
      email: 'vikram@example.com',
      organizationName: 'Nair Supplies',
    });

    const response = await api()
      .get(`/api/orders/${order.id}/invoice`)
      .set('Authorization', `Bearer ${rival.accessToken}`);

    expect(response.status).toBe(404);
  });
});

// The webhook secret is read at call time, so a test can supply one without the
// suite needing real Razorpay credentials.
async function withSecret(secret, run) {
  const { env } = await import('../config/env.js');
  const previous = env.RAZORPAY_WEBHOOK_SECRET;
  env.RAZORPAY_WEBHOOK_SECRET = secret;
  try {
    return await run();
  } finally {
    env.RAZORPAY_WEBHOOK_SECRET = previous;
  }
}
