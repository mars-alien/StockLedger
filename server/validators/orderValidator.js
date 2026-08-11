import { z } from 'zod';
import { paginationSchema } from '../utils/pagination.js';

// Header names arrive lowercased. Missing or malformed comes back as a 400
// naming the header, which is what the idempotency contract asks for.
export const idempotencyHeaderSchema = z
  .object({
    'idempotency-key': z.string().uuid('Idempotency-Key must be a UUID'),
  })
  .transform((headers) => ({ idempotencyKey: headers['idempotency-key'] }));

export const createOrderSchema = z.object({
  customerName: z.string().trim().min(1).max(120),
  customerPhone: z.string().trim().min(6).max(20).optional(),
  lines: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        quantity: z.number().int().min(1).max(10_000),
      }),
    )
    .min(1, 'An order needs at least one line')
    .max(50),
});

// Defaulted because a cancellation often carries no body at all, and Express
// leaves req.body undefined then.
export const cancelOrderSchema = z
  .object({
    note: z.string().trim().min(1).max(200).optional(),
  })
  .default({});

export const orderListQuerySchema = paginationSchema.extend({
  status: z.enum(['PLACED', 'CANCELLED']).optional(),
  paymentStatus: z.enum(['UNPAID', 'PAID', 'FAILED']).optional(),
  search: z.string().trim().min(1).max(80).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const orderParamsSchema = z.object({
  orderId: z.string().uuid(),
});
