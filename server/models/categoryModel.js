import { prisma } from '../config/db.js';

export function create({ organizationId, name, slug }, client = prisma) {
  return client.category.create({ data: { organizationId, name, slug } });
}

export function findById(id, organizationId, client = prisma) {
  return client.category.findFirst({ where: { id, organizationId } });
}

export function findBySlug(slug, organizationId, client = prisma) {
  return client.category.findFirst({ where: { slug, organizationId } });
}

export function list(organizationId, { skip, take, search }, client = prisma) {
  return client.category.findMany({
    where: buildWhere(organizationId, search),
    orderBy: { name: 'asc' },
    skip,
    take,
  });
}

export function count(organizationId, { search }, client = prisma) {
  return client.category.count({ where: buildWhere(organizationId, search) });
}

export function update(id, organizationId, data, client = prisma) {
  return client.category.update({ where: { id, organizationId }, data });
}

export function remove(id, organizationId, client = prisma) {
  return client.category.delete({ where: { id, organizationId } });
}

function buildWhere(organizationId, search) {
  if (!search) {
    return { organizationId };
  }
  return { organizationId, name: { contains: search, mode: 'insensitive' } };
}
