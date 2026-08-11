import { withTransaction } from '../config/db.js';
import * as variantModel from '../models/variantModel.js';
import * as stockMovementModel from '../models/stockMovementModel.js';
import * as auditLogModel from '../models/auditLogModel.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { toPage, toSkipTake } from '../utils/pagination.js';

export async function listMovements({ organizationId, page, limit, ...filters }) {
  const { skip, take } = toSkipTake({ page, limit });
  const [movements, total] = await Promise.all([
    stockMovementModel.list(organizationId, { skip, take, ...filters }),
    stockMovementModel.count(organizationId, filters),
  ]);

  return toPage({ data: movements, total, page, limit });
}

export async function listVariants({ organizationId, page, limit, search }) {
  const { skip, take } = toSkipTake({ page, limit });
  const [variants, total] = await Promise.all([
    variantModel.list(organizationId, { skip, take, search }),
    variantModel.count(organizationId, { search }),
  ]);

  return toPage({ data: variants, total, page, limit });
}

export function receiveStock({ organizationId, actorUserId, variantId, quantity, note }) {
  return applyMovement({
    organizationId,
    actorUserId,
    variantId,
    delta: quantity,
    reason: 'RECEIPT',
    note,
  });
}

export function adjustStock({ organizationId, actorUserId, variantId, delta, note }) {
  if (delta === 0) {
    throw new AppError('INVALID_ADJUSTMENT', 400, 'An adjustment has to add or remove something');
  }

  return applyMovement({
    organizationId,
    actorUserId,
    variantId,
    delta,
    reason: 'ADJUSTMENT',
    note,
  });
}

// The one path through which quantityOnHand ever changes in this phase, so the
// ledger and the running total cannot drift apart.
async function applyMovement({ organizationId, actorUserId, variantId, delta, reason, note }) {
  const movement = await withTransaction(async (tx) => {
    const locked = await variantModel.lockForUpdate(variantId, organizationId, tx);
    if (!locked) {
      throw new AppError('NOT_FOUND', 404, 'Variant not found');
    }

    const balanceAfter = locked.quantityOnHand + delta;
    if (balanceAfter < 0) {
      throw new AppError('INSUFFICIENT_STOCK', 409, 'That would leave stock below zero', [
        { variantId, available: locked.quantityOnHand, requested: Math.abs(delta) },
      ]);
    }

    await variantModel.applyStockDelta(variantId, organizationId, delta, tx);
    const created = await stockMovementModel.record(
      {
        organizationId,
        variantId,
        delta,
        reason,
        note,
        balanceAfter,
        createdByUserId: actorUserId,
      },
      tx,
    );
    await auditLogModel.record(
      {
        organizationId,
        actorUserId,
        action: reason === 'RECEIPT' ? 'stock.received' : 'stock.adjusted',
        entityType: 'ProductVariant',
        entityId: variantId,
        before: { quantityOnHand: locked.quantityOnHand },
        after: { quantityOnHand: balanceAfter, delta, note },
      },
      tx,
    );

    return created;
  });

  // Logged after the commit so the log never claims a movement that rolled back.
  logger.info(
    {
      variantId,
      delta,
      reason,
      balanceAfter: movement.balanceAfter,
      actorUserId,
    },
    'stock movement recorded',
  );

  return movement;
}
