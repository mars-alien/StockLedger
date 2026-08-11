import { z } from 'zod';

const email = z.string().trim().toLowerCase().email();
// bcrypt only looks at the first 72 bytes, so anything longer is rejected rather
// than silently truncated.
const password = z.string().min(8).max(72);

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email,
  password,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(72),
});

// Defaulted because a refresh call carries no body unless the client is asking
// for a specific organization, and Express leaves req.body undefined then.
export const refreshSchema = z
  .object({
    organizationId: z.string().uuid().optional(),
  })
  .default({});

export const invitationTokenParamsSchema = z.object({
  token: z.string().min(20).max(200),
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(20).max(200),
  name: z.string().trim().min(2).max(80).optional(),
  password: password.optional(),
});
