import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { withTransaction } from '../config/db.js';
import { env } from '../config/env.js';
import * as orderModel from '../models/orderModel.js';
import * as auditLogModel from '../models/auditLogModel.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

const configured = Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
const razorpay = configured
  ? new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET })
  : null;

export async function createIntent({ organizationId, orderId }) {
  requireConfigured();
  const order = await requirePayableOrder(organizationId, orderId);
  const razorpayOrder = await resolveRazorpayOrder(order, organizationId);

  return {
    razorpayOrderId: razorpayOrder.id,
    keyId: env.RAZORPAY_KEY_ID,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
  };
}

/**
 * An order gets one Razorpay order and keeps it.
 *
 * Creating a second would overwrite razorpayOrderId on the row, and a webhook
 * carrying the first id would then match nothing — a payment taken and never
 * recorded against anything. That is reachable by pressing the pay button
 * again after a checkout that did not report back cleanly.
 */
async function resolveRazorpayOrder(order, organizationId) {
  if (order.razorpayOrderId) {
    const existing = await razorpay.orders.fetch(order.razorpayOrderId).catch(() => null);

    // Razorpay says it is paid while this database still says it is not, which
    // means a webhook is late or was missed. Charging again would be worse than
    // waiting.
    if (existing?.status === 'paid') {
      throw new AppError(
        'ORDER_ALREADY_PAID',
        409,
        'Razorpay has already taken payment for this order. Refresh in a moment.',
      );
    }

    if (existing) {
      return existing;
    }
  }

  const created = await razorpay.orders.create({
    amount: order.totalCents,
    currency: 'INR',
    receipt: order.orderNumber,
    notes: { organizationId, orderId: order.id },
  });

  await orderModel.update(order.id, organizationId, { razorpayOrderId: created.id });
  return created;
}

/**
 * Called by the browser once Razorpay's checkout closes. The signature is an
 * HMAC of "<razorpay order id>|<payment id>" keyed with the API secret, so a
 * client cannot claim a payment it did not make: it would have to forge the MAC.
 */
export async function verifyCheckout({
  organizationId,
  actorUserId,
  razorpayOrderId,
  razorpayPaymentId,
  signature,
}) {
  requireConfigured();

  const expected = hmac(env.RAZORPAY_KEY_SECRET, `${razorpayOrderId}|${razorpayPaymentId}`);
  if (!matches(expected, signature)) {
    logger.warn({ organizationId, razorpayOrderId }, 'checkout signature did not verify');
    throw new AppError('PAYMENT_SIGNATURE_INVALID', 400, 'That payment could not be verified');
  }

  const order = await orderModel.findByRazorpayOrderId(razorpayOrderId);
  if (!order || order.organizationId !== organizationId) {
    throw new AppError('NOT_FOUND', 404, 'Order not found');
  }

  const result = await markPaid({ order, razorpayPaymentId, actorUserId, source: 'checkout' });
  if (result.cancelled) {
    throw new AppError(
      'ORDER_CANCELLED',
      409,
      'That order was cancelled before the payment arrived, so it will need refunding',
    );
  }
  return result;
}

/**
 * Razorpay calls this without any session of ours, so the webhook secret is the
 * only thing proving the request is genuine. The MAC is taken over the exact
 * bytes that arrived, which is why the raw body is captured before JSON parsing
 * rather than re-serialised here — re-serialising would change key order or
 * spacing and the signature would never match.
 */
export async function handleWebhook({ rawBody, signature }) {
  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    throw new AppError('PAYMENTS_UNAVAILABLE', 503, 'Payments are not configured');
  }

  // Only bodies that arrived as JSON are captured, so anything else reaches
  // here with nothing to hash. Refusing it plainly matters more than it looks:
  // hashing undefined throws, that becomes a 500, and Razorpay retries a 5xx
  // indefinitely rather than giving up on a request it can never get right.
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
    logger.warn('webhook arrived with no readable body');
    throw new AppError('PAYMENT_SIGNATURE_INVALID', 400, 'Signature did not verify');
  }

  const expected = hmac(env.RAZORPAY_WEBHOOK_SECRET, rawBody);
  if (!matches(expected, signature)) {
    logger.warn('webhook signature did not verify');
    throw new AppError('PAYMENT_SIGNATURE_INVALID', 400, 'Signature did not verify');
  }

  const payload = JSON.parse(rawBody.toString('utf8'));
  const entity = payload?.payload?.payment?.entity;

  if (payload?.event !== 'payment.captured' || !entity?.order_id) {
    // Razorpay sends events this app does not act on. Acknowledging them stops
    // it retrying forever.
    return { handled: false };
  }

  const order = await orderModel.findByRazorpayOrderId(entity.order_id);
  if (!order) {
    // Money has been captured and there is nothing here to attach it to. That
    // needs somebody to look, so it is an error rather than a passing note.
    logger.error(
      { razorpayOrderId: entity.order_id, razorpayPaymentId: entity.id },
      'captured payment does not match any order',
    );
    return { handled: false };
  }

  const result = await markPaid({
    order,
    razorpayPaymentId: entity.id,
    actorUserId: order.placedByUserId,
    source: 'webhook',
  });

  // Acknowledged either way. Razorpay retries anything that is not a 2xx, and
  // retrying will not make a cancelled order payable — the error log is what
  // raises the alarm.
  return { handled: !result.cancelled };
}

// Both the browser callback and the webhook land here, and either can arrive
// first or twice, so marking an order paid has to be safe to repeat.
async function markPaid({ order, razorpayPaymentId, actorUserId, source }) {
  if (order.paymentStatus === 'PAID') {
    return { alreadyPaid: true };
  }

  // An intent created before the order was cancelled stays payable: Razorpay has
  // no way to void an order. Money arriving for an order whose stock is already
  // back on the shelf must not be recorded as a normal payment — it needs a
  // refund, which is out of scope, so it needs a person to see it.
  if (order.status === 'CANCELLED') {
    logger.error(
      { orderId: order.id, orderNumber: order.orderNumber, razorpayPaymentId, source },
      'payment captured for a cancelled order, refund needed',
    );
    return { cancelled: true };
  }

  await withTransaction(async (tx) => {
    await orderModel.update(
      order.id,
      order.organizationId,
      { paymentStatus: 'PAID', razorpayPaymentId },
      tx,
    );
    await auditLogModel.record(
      {
        organizationId: order.organizationId,
        actorUserId,
        action: 'order.paid',
        entityType: 'Order',
        entityId: order.id,
        before: { paymentStatus: order.paymentStatus },
        after: { paymentStatus: 'PAID', razorpayPaymentId, source },
      },
      tx,
    );
  });

  logger.info(
    { orderId: order.id, orderNumber: order.orderNumber, razorpayPaymentId, source },
    'order marked paid',
  );

  return { alreadyPaid: false };
}

async function requirePayableOrder(organizationId, orderId) {
  const order = await orderModel.findById(orderId, organizationId);

  if (!order) {
    throw new AppError('NOT_FOUND', 404, 'Order not found');
  }
  if (order.status === 'CANCELLED') {
    throw new AppError('ORDER_CANCELLED', 409, 'A cancelled order cannot be paid for');
  }
  if (order.paymentStatus === 'PAID') {
    throw new AppError('ORDER_ALREADY_PAID', 409, 'That order has already been paid');
  }
  return order;
}

function requireConfigured() {
  if (!configured) {
    throw new AppError('PAYMENTS_UNAVAILABLE', 503, 'Payments are not configured');
  }
}

function hmac(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

// Constant time, so a wrong signature cannot be narrowed down by timing how
// long the comparison took.
function matches(expected, provided) {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(provided ?? ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
