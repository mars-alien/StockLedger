import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

// Silent under test: the idempotency path provokes a unique-constraint error on
// purpose, and Prisma logging it as an error makes a passing run look broken.
const logLevels = { development: ['warn', 'error'], test: [], production: ['error'] };

export const prisma = new PrismaClient({ log: logLevels[env.NODE_ENV] });

// Services own transactions but must not import Prisma, so the client stays
// behind this one function. Model functions accept the `tx` it hands out, which
// is what lets a service compose several models into a single transaction.
export function withTransaction(run, options) {
  return prisma.$transaction(run, options);
}

export function disconnect() {
  return prisma.$disconnect();
}
