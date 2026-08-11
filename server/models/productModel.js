import { prisma } from '../config/db.js';

const listSelect = {
  id: true,
  sku: true,
  name: true,
  imageUrl: true,
  isActive: true,
  createdAt: true,
  category: { select: { id: true, name: true } },
  _count: { select: { variants: true } },
};

export function create({ organizationId, sku, name, description, categoryId }, client = prisma) {
  return client.product.create({
    data: { organizationId, sku, name, description, categoryId },
  });
}

export function findById(id, organizationId, client = prisma) {
  return client.product.findFirst({
    where: { id, organizationId },
    include: {
      category: { select: { id: true, name: true } },
      variants: { orderBy: { createdAt: 'asc' } },
    },
  });
}

export function findBySku(sku, organizationId, client = prisma) {
  return client.product.findFirst({ where: { sku, organizationId } });
}

export function list(
  organizationId,
  { skip, take, search, categoryId, isActive },
  client = prisma,
) {
  return client.product.findMany({
    where: buildWhere(organizationId, { search, categoryId, isActive }),
    select: listSelect,
    orderBy: { createdAt: 'desc' },
    skip,
    take,
  });
}

export function count(organizationId, { search, categoryId, isActive }, client = prisma) {
  return client.product.count({
    where: buildWhere(organizationId, { search, categoryId, isActive }),
  });
}

export function update(id, organizationId, data, client = prisma) {
  return client.product.update({ where: { id, organizationId }, data });
}

export function remove(id, organizationId, client = prisma) {
  return client.product.delete({ where: { id, organizationId } });
}

export function countMovementsForProduct(id, organizationId, client = prisma) {
  return client.stockMovement.count({
    where: { organizationId, variant: { productId: id } },
  });
}

function buildWhere(organizationId, { search, categoryId, isActive }) {
  const where = { organizationId };

  if (categoryId) {
    where.categoryId = categoryId;
  }
  if (typeof isActive === 'boolean') {
    where.isActive = isActive;
  }
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { sku: { contains: search, mode: 'insensitive' } },
    ];
  }
  return where;
}
