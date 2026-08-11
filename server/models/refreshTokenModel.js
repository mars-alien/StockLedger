import { prisma } from '../config/db.js';

export function create({ userId, tokenHash, familyId, expiresAt }, client = prisma) {
  return client.refreshToken.create({ data: { userId, tokenHash, familyId, expiresAt } });
}

export function findByHash(tokenHash, client = prisma) {
  return client.refreshToken.findUnique({ where: { tokenHash } });
}

export function findById(id, client = prisma) {
  return client.refreshToken.findUnique({ where: { id } });
}

// Locks the row for the rest of the transaction. Without it two tabs refreshing
// together both read an unrotated token and both rotate it, which leaves two
// live tokens in one family and a rotation chain that records only the second.
export async function lockByHash(tokenHash, client = prisma) {
  const rows = await client.$queryRawUnsafe(
    `SELECT id, "userId", "familyId", "expiresAt", "revokedAt", "replacedById"
       FROM "refreshTokens"
      WHERE "tokenHash" = $1
        FOR UPDATE`,
    tokenHash,
  );
  return rows[0] ?? null;
}

export function markReplaced(id, replacedById, client = prisma) {
  return client.refreshToken.update({
    where: { id },
    data: { replacedById, revokedAt: new Date() },
  });
}

export function revokeFamily(familyId, client = prisma) {
  return client.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
