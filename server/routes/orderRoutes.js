import { Router } from 'express';
import * as orderController from '../controllers/orderController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { tenantMiddleware } from '../middleware/tenantMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  cancelOrderSchema,
  createOrderSchema,
  idempotencyHeaderSchema,
  orderListQuerySchema,
  orderParamsSchema,
} from '../validators/orderValidator.js';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

router.get('/', validate({ query: orderListQuerySchema }), orderController.list);

// Staff exist to take orders, so every role can place one.
router.post(
  '/',
  validate({ headers: idempotencyHeaderSchema, body: createOrderSchema }),
  orderController.create,
);

router.get('/:orderId', validate({ params: orderParamsSchema }), orderController.get);

router.get(
  '/:orderId/invoice',
  validate({ params: orderParamsSchema }),
  orderController.downloadInvoice,
);

router.post(
  '/:orderId/cancel',
  requireRole('OWNER', 'MANAGER'),
  validate({ params: orderParamsSchema, body: cancelOrderSchema }),
  orderController.cancel,
);

export default router;
