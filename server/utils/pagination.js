import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export function toSkipTake({ page, limit }) {
  return { skip: (page - 1) * limit, take: limit };
}

export function toPage({ data, total, page, limit }) {
  return { data, page, limit, total, totalPages: Math.ceil(total / limit) };
}
