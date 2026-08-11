import crypto from 'node:crypto';
import { withTransaction } from '../config/db.js';
import { IDEMPOTENCY_KEY_TTL_HOURS, TAX_RATE_BASIS_POINTS } from '../config/constants.js';
import * as orderModel from '../models/orderModel.js';
import * as variantModel from '../models/variantModel.js';
import * as stockMovementModel from '../models/stockMovementModel.js';
import * as idempotencyKeyModel from '../models/idempotencyKeyModel.js';
import * as organizationModel from '../models/organizationModel.js';
import * as auditLogModel from '../models/auditLogModel.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { renderInvoice } from '../utils/invoicePdf.js';
import { lineTotal, orderTotals } from '../utils/money.js';
import { generateOrderNumber } from '../utils/orderNumber.js';
import { toPage, toSkipTake } from '../utils/pagination.js';

// Orders queue on the same row lock by design, so a burst of them spends most
// of its time waiting rather than working. The defaults (2s to get a connection,
// 5s to finish) are tuned for uncontended writes and would turn a busy minute
// into spurious failures.
const PLACEMENT_TRANSACTION = { maxWait: 15_000, timeout: 20_000 };

export async function list({ organizationId, page, limit, ...filters }) {
  const { skip, take } = toSkipTake({ page, limit });
  const [orders, total] = await Promise.all([
    orderModel.list(organizationId, { skip, take, ...filters }),
    orderModel.count(organizationId, filters),
  ]);

  return toPage({ data: orders, total, page, limit });
}

export async function get({ organizationId, orderId }) {
  return requireOrder(organizationId, orderId);
}

/**
 * Placing an order is the one operation in this system where two people can
 * genuinely collide, so it is worth reading in order:
 *
 *  1. claim the idempotency key, so a retry never becomes a second order
 *  2. sort the variant ids and lock those rows, so overlapping orders queue
 *     rather than deadlock
 *  3. check every line against the locked quantities and refuse the whole
 *     order if any one of them is short
 *  4. write the order, its lines, the ledger movements and the audit row
 *  5. record the response against the key
 */
export async function placeOrder({ organizationId, actorUserId, idempotencyKey, payload }) {
  const requestHash = hashRequest(payload);
  const claim = await claimKey({ organizationId, key: idempotencyKey, requestHash });

  if (claim.replayed) {
    return claim;
  }

  try {
    const order = await runPlacement({ organizationId, actorUserId, payload });
    await idempotencyKeyModel.storeResponse(claim.id, {
      responseStatus: 201,
      responseBody: order,
    });
    pruneExpiredKeys();
    return { replayed: false, status: 201, body: order };
  } catch (error) {
    if (error instanceof AppError) {
      // A refusal is a real answer. The same key asking the same question again
      // has to get the same refusal, not a second attempt at the work.
      await idempotencyKeyModel.storeResponse(claim.id, {
        responseStatus: error.statusCode,
        responseBody: toErrorBody(error),
      });
      throw error;
    }

    // Something unexpected went wrong, so the key is released and the caller is
    // free to retry rather than being stuck with a failure they cannot clear.
    await idempotencyKeyModel.remove(claim.id);
    throw error;
  }
}

export async function buildInvoice({ organizationId, orderId }) {
  const order = await requireOrder(organizationId, orderId);
  const organization = await organizationModel.findById(organizationId);

  return {
    filename: `invoice-${order.orderNumber}.pdf`,
    document: renderInvoice({ order, organization }),
  };
}

export async function cancelOrder({ organizationId, actorUserId, orderId, note }) {
  const order = await requireOrder(organizationId, orderId);

  // paymentStatus is the only field that speaks for money, so it is the only
  // one asked. Refunds are out of scope, which makes a paid order the end of
  // the line.
  if (order.paymentStatus === 'PAID') {
    throw new AppError('ORDER_ALREADY_PAID', 409, 'A paid order cannot be cancelled');
  }
  if (order.status === 'CANCELLED') {
    throw new AppError('ORDER_ALREADY_CANCELLED', 409, 'That order is already cancelled');
  }

  const variantIds = [...new Set(order.lines.map((line) => line.variantId))].sort();

  const cancelled = await withTransaction(async (tx) => {
    const locked = await variantModel.lockVariantsForUpdate(variantIds, organizationId, tx);

    // The same check placement makes. Without it a missing row would leave
    // balanceAfter as NaN and fail deep inside the transaction instead of here.
    if (locked.length !== variantIds.length) {
      throw new AppError('NOT_FOUND', 404, 'One or more of those variants no longer exists');
    }

    const balances = new Map(locked.map((row) => [row.id, row.quantityOnHand]));

    for (const line of order.lines) {
      const balanceAfter = balances.get(line.variantId) + line.quantity;
      await variantModel.applyStockDelta(line.variantId, organizationId, line.quantity, tx);
      await stockMovementModel.record(
        {
          organizationId,
          variantId: line.variantId,
          delta: line.quantity,
          reason: 'CANCELLATION',
          note,
          balanceAfter,
          orderId: order.id,
          createdByUserId: actorUserId,
        },
        tx,
      );
    }

    await orderModel.update(orderId, organizationId, { status: 'CANCELLED' }, tx);
    await auditLogModel.record(
      {
        organizationId,
        actorUserId,
        action: 'order.cancelled',
        entityType: 'Order',
        entityId: orderId,
        before: { status: order.status },
        after: { status: 'CANCELLED', note },
      },
      tx,
    );

    return orderModel.findById(orderId, organizationId, tx);
  });

  logger.info(
    { orderId, orderNumber: order.orderNumber, lines: order.lines.length, actorUserId },
    'order cancelled, stock returned to the ledger',
  );

  return cancelled;
}

async function runPlacement({ organizationId, actorUserId, payload }) {
  const wanted = mergeLines(payload.lines);
  // Ascending, and the model orders by id too. Both orders that touch the same
  // pair of variants therefore reach for them in the same sequence.
  const variantIds = [...wanted.keys()].sort();

  const order = await withTransaction(async (tx) => {
    const locked = await variantModel.lockVariantsForUpdate(variantIds, organizationId, tx);

    if (locked.length !== variantIds.length) {
      throw new AppError('NOT_FOUND', 404, 'One or more of those variants does not exist');
    }

    const shortages = locked
      .filter((variant) => variant.quantityOnHand < wanted.get(variant.id))
      .map((variant) => ({
        variantId: variant.id,
        requested: wanted.get(variant.id),
        available: variant.quantityOnHand,
      }));

    // All or nothing: one short line rolls the whole transaction back, so a
    // customer never gets half an order.
    if (shortages.length > 0) {
      throw new AppError(
        'OUT_OF_STOCK',
        409,
        `Insufficient stock for ${shortages.length} item${shortages.length > 1 ? 's' : ''}`,
        shortages,
      );
    }

    const lines = locked.map((variant) => {
      const quantity = wanted.get(variant.id);
      return {
        variantId: variant.id,
        quantity,
        unitPriceCents: variant.priceCents,
        lineTotalCents: lineTotal(variant.priceCents, quantity),
      };
    });

    const created = await orderModel.create(
      {
        organizationId,
        orderNumber: generateOrderNumber(),
        customerName: payload.customerName,
        customerPhone: payload.customerPhone ?? null,
        placedByUserId: actorUserId,
        ...orderTotals(lines, TAX_RATE_BASIS_POINTS),
      },
      tx,
    );

    await orderModel.createLines(
      lines.map((line) => ({ ...line, organizationId, orderId: created.id })),
      tx,
    );

    for (const variant of locked) {
      const quantity = wanted.get(variant.id);
      await variantModel.applyStockDelta(variant.id, organizationId, -quantity, tx);
      await stockMovementModel.record(
        {
          organizationId,
          variantId: variant.id,
          delta: -quantity,
          reason: 'SALE',
          balanceAfter: variant.quantityOnHand - quantity,
          orderId: created.id,
          createdByUserId: actorUserId,
        },
        tx,
      );
    }

    await auditLogModel.record(
      {
        organizationId,
        actorUserId,
        action: 'order.placed',
        entityType: 'Order',
        entityId: created.id,
        after: { orderNumber: created.orderNumber, totalCents: created.totalCents },
      },
      tx,
    );

    return orderModel.findById(created.id, organizationId, tx);
  }, PLACEMENT_TRANSACTION);

  logger.info(
    {
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalCents: order.totalCents,
      actorUserId,
    },
    'order placed',
  );

  return order;
}

/**
 * Keys stop being useful once no client could still be retrying with them, and
 * there is no scheduler in this project to sweep them up. Placement does it
 * instead, at most once an hour, without making the caller wait: a tidy-up that
 * fails is not a reason to fail an order that already committed.
 */
let lastPruneAt = 0;

function pruneExpiredKeys() {
  const hour = 60 * 60 * 1000;
  if (Date.now() - lastPruneAt < hour) {
    return;
  }
  lastPruneAt = Date.now();

  const cutoff = new Date(Date.now() - IDEMPOTENCY_KEY_TTL_HOURS * hour);
  idempotencyKeyModel
    .deleteOlderThan(cutoff)
    .then(({ count }) => {
      if (count > 0) {
        logger.info({ count }, 'pruned expired idempotency keys');
      }
    })
    .catch((error) => logger.warn({ err: error }, 'could not prune idempotency keys'));
}

// Inserting the key before any work means the unique constraint decides who
// goes first. There is no lock and no polling: the database already has an
// atomic way to say "somebody claimed this", and a duplicate insert is it.
async function claimKey({ organizationId, key, requestHash }) {
  try {
    const row = await idempotencyKeyModel.create({ organizationId, key, requestHash });
    return { replayed: false, id: row.id };
  } catch (error) {
    if (error?.code !== 'P2002') {
      throw error;
    }

    const existing = await idempotencyKeyModel.findByKey(organizationId, key);
    if (!existing) {
      throw error;
    }

    if (existing.requestHash !== requestHash) {
      throw new AppError(
        'IDEMPOTENCY_KEY_REUSED',
        422,
        'That idempotency key was already used for a different order',
      );
    }

    if (existing.responseStatus === null) {
      throw new AppError(
        'IDEMPOTENCY_IN_PROGRESS',
        409,
        'The first request with this key is still being processed',
      );
    }

    return { replayed: true, status: existing.responseStatus, body: existing.responseBody };
  }
}

// The same variant listed twice is one line for locking and for stock, or the
// second mention would be checked against a quantity the first already spent.
function mergeLines(lines) {
  const merged = new Map();
  for (const line of lines) {
    merged.set(line.variantId, (merged.get(line.variantId) ?? 0) + line.quantity);
  }
  return merged;
}

function hashRequest(payload) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonical(payload)))
    .digest('hex');
}

// Key order and line order must not change the hash, otherwise the same order
// submitted twice by a retrying client would look like a different request.
function canonical(payload) {
  return {
    customerName: payload.customerName,
    customerPhone: payload.customerPhone ?? null,
    lines: [...payload.lines]
      .map((line) => ({ variantId: line.variantId, quantity: line.quantity }))
      .sort((a, b) => a.variantId.localeCompare(b.variantId)),
  };
}

function toErrorBody(error) {
  return { error: { code: error.code, message: error.message, details: error.details } };
}

async function requireOrder(organizationId, orderId) {
  const order = await orderModel.findById(orderId, organizationId);
  if (!order) {
    throw new AppError('NOT_FOUND', 404, 'Order not found');
  }
  return order;
}
