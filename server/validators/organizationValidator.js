import { z } from 'zod';
import { paginationSchema } from '../utils/pagination.js';

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(80),
});

export const organizationListQuerySchema = paginationSchema;

export const organizationParamsSchema = z.object({
  organizationId: z.string().uuid(),
});
