import { prisma } from '../config/db.js';

const listSelect = {
  id: true,
  sku: true,
  name: true,
  priceCents: true,
  costCents: true,
  quantityOnHand: true,
  product: { select: { id: true, name: true, sku: true } },
};

export function create(
  { organizationId, productId, sku, name, attributes, priceCents, costCents },
  client = prisma,
) {
  return client.productVariant.create({
    data: { organizationId, productId, sku, name, attributes, priceCents, costCents },
  });
}

export function findById(id, organizationId, client = prisma) {
  return client.productVariant.findFirst({
    where: { id, organizationId },
    include: { product: { select: { id: true, name: true, sku: true } } },
  });
}

export function findBySku(sku, organizationId, client = prisma) {
  return client.productVariant.findFirst({ where: { sku, organizationId } });
}

export function list(organizationId, { skip, take, search }, client = prisma) {
  return client.productVariant.findMany({
    where: buildWhere(organizationId, search),
    select: listSelect,
    orderBy: { name: 'asc' },
    skip,
    take,
  });
}

export function count(organizationId, { search }, client = prisma) {
  return client.productVariant.count({ where: buildWhere(organizationId, search) });
}

export function update(id, organizationId, data, client = prisma) {
  return client.productVariant.update({ where: { id, organizationId }, data });
}

export function remove(id, organizationId, client = prisma) {
  return client.productVariant.delete({ where: { id, organizationId } });
}

export function countMovements(id, organizationId, client = prisma) {
  return client.stockMovement.count({ where: { variantId: id, organizationId } });
}

// Locks the row for the rest of the transaction, so two people receiving or
// adjusting the same variant at once cannot both read the same quantityOnHand
// and write a balanceAfter that skips one of the movements.
export async function lockForUpdate(id, organizationId, client = prisma) {
  const rows = await client.$queryRawUnsafe(
    `SELECT id, "quantityOnHand"
       FROM "productVariants"
      WHERE id = $1::uuid AND "organizationId" = $2::uuid
        FOR UPDATE`,
    id,
    organizationId,
  );
  return rows[0] ?? null;
}

// Locks several variants in one statement. The caller sorts the ids first and
// this orders by id as well, so two orders that overlap always take their locks
// in the same sequence. Without that, one order can hold A while waiting for B
// as the other holds B waiting for A, and Postgres has to kill one of them.
export function lockVariantsForUpdate(ids, organizationId, client = prisma) {
  return client.$queryRawUnsafe(
    `SELECT id, "quantityOnHand", "priceCents"
       FROM "productVariants"
      WHERE id = ANY($1::uuid[]) AND "organizationId" = $2::uuid
      ORDER BY id
        FOR UPDATE`,
    ids,
    organizationId,
  );
}

// Used only by the seeder, which writes every movement first and then brings
// the running total in line with them in one pass.
export function setQuantityOnHand(id, organizationId, quantityOnHand, client = prisma) {
  return client.productVariant.update({
    where: { id, organizationId },
    data: { quantityOnHand },
  });
}

export function applyStockDelta(id, organizationId, delta, client = prisma) {
  return client.productVariant.update({
    where: { id, organizationId },
    data: { quantityOnHand: { increment: delta } },
  });
}

function buildWhere(organizationId, search) {
  if (!search) {
    return { organizationId };
  }
  return {
    organizationId,
    OR: [
      { name: { contains: search, mode: 'insensitive' } },
      { sku: { contains: search, mode: 'insensitive' } },
      { product: { name: { contains: search, mode: 'insensitive' } } },
    ],
  };
}
