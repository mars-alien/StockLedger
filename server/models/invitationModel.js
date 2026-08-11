import { prisma } from '../config/db.js';

export function create({ organizationId, email, role, tokenHash, expiresAt }, client = prisma) {
  return client.invitation.create({
    data: { organizationId, email, role, tokenHash, expiresAt },
  });
}

// Not scoped by organizationId, because the token itself is the credential and
// it is what identifies the organization being joined.
export function findByTokenHash(tokenHash, client = prisma) {
  return client.invitation.findUnique({ where: { tokenHash }, include: { organization: true } });
}

export function findPending(organizationId, email, client = prisma) {
  return client.invitation.findFirst({
    where: { organizationId, email, acceptedAt: null, expiresAt: { gt: new Date() } },
  });
}

export function findPendingById(organizationId, id, client = prisma) {
  return client.invitation.findFirst({ where: { id, organizationId, acceptedAt: null } });
}

export function listPending(organizationId, { skip, take }, client = prisma) {
  return client.invitation.findMany({
    where: { organizationId, acceptedAt: null },
    select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    skip,
    take,
  });
}

export function countPending(organizationId, client = prisma) {
  return client.invitation.count({ where: { organizationId, acceptedAt: null } });
}

export function markAccepted(id, client = prisma) {
  return client.invitation.update({ where: { id }, data: { acceptedAt: new Date() } });
}

export function remove(id, organizationId, client = prisma) {
  return client.invitation.delete({ where: { id, organizationId } });
}
