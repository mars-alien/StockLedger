import { z } from 'zod';
import { paginationSchema } from '../utils/pagination.js';

export const categoryListQuerySchema = paginationSchema.extend({
  search: z.string().trim().min(1).max(80).optional(),
});

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(60),
});

export const updateCategorySchema = createCategorySchema;

export const categoryParamsSchema = z.object({
  categoryId: z.string().uuid(),
});
