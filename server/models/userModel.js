import { prisma } from '../config/db.js';

export function findByEmail(email, client = prisma) {
  return client.user.findUnique({ where: { email } });
}

export function findById(id, client = prisma) {
  return client.user.findUnique({ where: { id } });
}

export function create({ name, email, passwordHash }, client = prisma) {
  return client.user.create({ data: { name, email, passwordHash } });
}
