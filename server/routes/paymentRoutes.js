import { Router } from 'express';
import * as paymentController from '../controllers/paymentController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { tenantMiddleware } from '../middleware/tenantMiddleware.js';
import { validate } from '../middleware/validate.js';
import { paymentOrderParamsSchema, verifyCheckoutSchema } from '../validators/paymentValidator.js';

const router = Router();

// Razorpay has no session here, so this one route is public and the webhook
// secret is what authenticates it. It is declared before the auth middleware
// below rather than after it.
router.post('/webhook', paymentController.handleWebhook);

router.use(authMiddleware, tenantMiddleware);

router.post(
  '/orders/:orderId/intent',
  validate({ params: paymentOrderParamsSchema }),
  paymentController.createIntent,
);
router.post('/verify', validate({ body: verifyCheckoutSchema }), paymentController.verifyCheckout);

export default router;
