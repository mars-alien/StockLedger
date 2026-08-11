import { z } from 'zod';

export const paymentOrderParamsSchema = z.object({
  orderId: z.string().uuid(),
});

export const verifyCheckoutSchema = z.object({
  razorpayOrderId: z.string().trim().min(1).max(80),
  razorpayPaymentId: z.string().trim().min(1).max(80),
  signature: z.string().trim().min(1).max(200),
});
