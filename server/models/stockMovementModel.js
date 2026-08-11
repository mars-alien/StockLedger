import { prisma } from '../config/db.js';

const listSelect = {
  id: true,
  delta: true,
  reason: true,
  note: true,
  balanceAfter: true,
  createdAt: true,
  variant: {
    select: {
      id: true,
      sku: true,
      name: true,
      product: { select: { id: true, name: true } },
    },
  },
  createdByUser: { select: { id: true, name: true } },
};

// orderId is null for receipts and manual adjustments and set for anything a
// sale or a cancellation caused. Leaving it out of this list once meant every
// movement written through here lost its link to the order silently, which no
// balance check would have caught.
export function record(
  { organizationId, variantId, delta, reason, note, balanceAfter, orderId, createdByUserId },
  client = prisma,
) {
  return client.stockMovement.create({
    data: {
      organizationId,
      variantId,
      delta,
      reason,
      note,
      balanceAfter,
      orderId,
      createdByUserId,
    },
  });
}

export function recordMany(movements, client = prisma) {
  return client.stockMovement.createMany({ data: movements });
}

export function list(organizationId, { skip, take, ...filters }, client = prisma) {
  return client.stockMovement.findMany({
    where: buildWhere(organizationId, filters),
    select: listSelect,
    orderBy: { createdAt: 'desc' },
    skip,
    take,
  });
}

export function count(organizationId, filters, client = prisma) {
  return client.stockMovement.count({ where: buildWhere(organizationId, filters) });
}

function buildWhere(organizationId, { variantId, productId, orderId, reason, from, to }) {
  const where = { organizationId };

  if (variantId) {
    where.variantId = variantId;
  }
  if (orderId) {
    where.orderId = orderId;
  }
  if (productId) {
    where.variant = { productId };
  }
  if (reason) {
    where.reason = reason;
  }
  if (from || to) {
    where.createdAt = {};
    if (from) {
      where.createdAt.gte = from;
    }
    if (to) {
      where.createdAt.lte = to;
    }
  }
  return where;
}
