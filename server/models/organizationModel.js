import { prisma } from '../config/db.js';

export function create({ name, slug }, client = prisma) {
  return client.organization.create({ data: { name, slug } });
}

export function findById(id, client = prisma) {
  return client.organization.findUnique({ where: { id } });
}

export function findBySlug(slug, client = prisma) {
  return client.organization.findUnique({ where: { slug } });
}

// Scoped by membership rather than by organizationId: this is the one list that
// deliberately spans organizations, and a user only ever sees their own.
export function listForUser(userId, { skip, take }, client = prisma) {
  return client.organization.findMany({
    where: { memberships: { some: { userId } } },
    orderBy: { createdAt: 'asc' },
    skip,
    take,
  });
}

export function countForUser(userId, client = prisma) {
  return client.organization.count({ where: { memberships: { some: { userId } } } });
}
