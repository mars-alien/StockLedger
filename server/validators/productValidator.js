import { z } from 'zod';
import { paginationSchema } from '../utils/pagination.js';

const skuSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[A-Za-z0-9._-]+$/, 'Use letters, numbers, dot, dash or underscore');

// Money is stored as whole paise, so anything fractional is a bug in the caller
// rather than something to round away here.
const paiseSchema = z.number().int().min(0).max(100_000_000);

const requireOneField = (value) => Object.keys(value).length > 0;
const atLeastOne = { message: 'Provide at least one field to update' };

export const productListQuerySchema = paginationSchema.extend({
  search: z.string().trim().min(1).max(80).optional(),
  categoryId: z.string().uuid().optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export const createProductSchema = z.object({
  sku: skuSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullish(),
  categoryId: z.string().uuid().nullish(),
});

export const updateProductSchema = z
  .object({
    sku: skuSchema.optional(),
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(2000).nullish(),
    categoryId: z.string().uuid().nullish(),
    isActive: z.boolean().optional(),
  })
  .refine(requireOneField, atLeastOne);

export const createVariantSchema = z.object({
  sku: skuSchema,
  name: z.string().trim().min(1).max(120),
  attributes: z.record(z.string().max(60)).optional(),
  priceCents: paiseSchema,
  costCents: paiseSchema,
});

export const updateVariantSchema = z
  .object({
    sku: skuSchema.optional(),
    name: z.string().trim().min(1).max(120).optional(),
    attributes: z.record(z.string().max(60)).optional(),
    priceCents: paiseSchema.optional(),
    costCents: paiseSchema.optional(),
  })
  .refine(requireOneField, atLeastOne);

export const productParamsSchema = z.object({
  productId: z.string().uuid(),
});

export const variantParamsSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid(),
});
