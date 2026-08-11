import { prisma } from '../config/db.js';

export function record(
  { organizationId, actorUserId, action, entityType, entityId, before = null, after = null },
  client = prisma,
) {
  return client.auditLog.create({
    data: { organizationId, actorUserId, action, entityType, entityId, before, after },
  });
}
