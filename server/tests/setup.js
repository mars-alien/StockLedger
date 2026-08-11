import { afterAll, beforeEach } from 'vitest';
import { disconnect, prisma } from '../config/db.js';

const TABLES = [
  '"auditLogs"',
  '"idempotencyKeys"',
  '"orderLines"',
  '"orders"',
  '"stockMovements"',
  '"productVariants"',
  '"products"',
  '"categories"',
  '"refreshTokens"',
  '"invitations"',
  '"memberships"',
  '"organizations"',
  '"users"',
].join(', ');

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TABLES} RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await disconnect();
});
