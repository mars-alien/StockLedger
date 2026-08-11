import { prisma } from '../config/db.js';

const memberSelect = {
  id: true,
  role: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true } },
};

export function create({ userId, organizationId, role }, client = prisma) {
  return client.membership.create({ data: { userId, organizationId, role } });
}

export function findByUserAndOrganization(userId, organizationId, client = prisma) {
  return client.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
    include: { organization: true },
  });
}

// The organization a user lands in when they sign in and have not chosen one.
export function findDefaultForUser(userId, client = prisma) {
  return client.membership.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    include: { organization: true },
  });
}

export function findById(id, organizationId, client = prisma) {
  return client.membership.findFirst({
    where: { id, organizationId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
}

export function listByOrganization(organizationId, { skip, take, search }, client = prisma) {
  return client.membership.findMany({
    where: buildWhere(organizationId, search),
    select: memberSelect,
    orderBy: { createdAt: 'asc' },
    skip,
    take,
  });
}

export function countByOrganization(organizationId, { search }, client = prisma) {
  return client.membership.count({ where: buildWhere(organizationId, search) });
}

export function countByRole(organizationId, role, client = prisma) {
  return client.membership.count({ where: { organizationId, role } });
}

export function updateRole(id, organizationId, role, client = prisma) {
  return client.membership.update({
    where: { id, organizationId },
    data: { role },
    select: memberSelect,
  });
}

export function remove(id, organizationId, client = prisma) {
  return client.membership.delete({ where: { id, organizationId } });
}

function buildWhere(organizationId, search) {
  if (!search) {
    return { organizationId };
  }
  return {
    organizationId,
    user: {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ],
    },
  };
}
