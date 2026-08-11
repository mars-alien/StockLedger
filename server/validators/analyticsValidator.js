import { z } from 'zod';

export const dashboardQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(730).default(180),
});
