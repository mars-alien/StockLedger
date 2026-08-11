import { prisma } from '../config/db.js';

export function create({ organizationId, key, requestHash }, client = prisma) {
  return client.idempotencyKey.create({ data: { organizationId, key, requestHash } });
}

export function findByKey(organizationId, key, client = prisma) {
  return client.idempotencyKey.findUnique({
    where: { organizationId_key: { organizationId, key } },
  });
}

export function storeResponse(id, { responseStatus, responseBody }, client = prisma) {
  return client.idempotencyKey.update({ where: { id }, data: { responseStatus, responseBody } });
}

export function remove(id, client = prisma) {
  return client.idempotencyKey.delete({ where: { id } });
}

export function deleteOlderThan(cutoff, client = prisma) {
  return client.idempotencyKey.deleteMany({ where: { createdAt: { lt: cutoff } } });
}
