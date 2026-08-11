import { z } from 'zod';
import { paginationSchema } from '../utils/pagination.js';

const roleSchema = z.enum(['OWNER', 'MANAGER', 'STAFF']);

export const memberListQuerySchema = paginationSchema.extend({
  search: z.string().trim().min(1).max(80).optional(),
});

export const invitationListQuerySchema = paginationSchema;

export const inviteMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: roleSchema,
});

export const changeRoleSchema = z.object({
  role: roleSchema,
});

export const membershipParamsSchema = z.object({
  membershipId: z.string().uuid(),
});

export const invitationParamsSchema = z.object({
  invitationId: z.string().uuid(),
});
