import { z } from 'zod';
import { paginationSchema } from '../utils/pagination.js';

const noteSchema = z.string().trim().min(1).max(200);

export const movementListQuerySchema = paginationSchema.extend({
  variantId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
  reason: z.enum(['RECEIPT', 'SALE', 'ADJUSTMENT', 'CANCELLATION']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const variantListQuerySchema = paginationSchema.extend({
  search: z.string().trim().min(1).max(80).optional(),
});

export const receiveStockSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(1_000_000),
  note: noteSchema.optional(),
});

// An adjustment always carries a reason, because an unexplained correction is
// exactly the thing an audit needs to be able to question.
export const adjustStockSchema = z.object({
  variantId: z.string().uuid(),
  delta: z
    .number()
    .int()
    .min(-1_000_000)
    .max(1_000_000)
    .refine((value) => value !== 0, 'An adjustment cannot be zero'),
  note: noteSchema,
});
