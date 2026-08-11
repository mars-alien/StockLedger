import { Router } from 'express';
import * as inventoryController from '../controllers/inventoryController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { tenantMiddleware } from '../middleware/tenantMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  adjustStockSchema,
  movementListQuerySchema,
  receiveStockSchema,
  variantListQuerySchema,
} from '../validators/inventoryValidator.js';

const router = Router();
const canMoveStock = requireRole('OWNER', 'MANAGER');

router.use(authMiddleware, tenantMiddleware);

router.get(
  '/movements',
  validate({ query: movementListQuerySchema }),
  inventoryController.listMovements,
);
router.get(
  '/variants',
  validate({ query: variantListQuerySchema }),
  inventoryController.listVariants,
);

router.post(
  '/receive',
  canMoveStock,
  validate({ body: receiveStockSchema }),
  inventoryController.receiveStock,
);
router.post(
  '/adjust',
  canMoveStock,
  validate({ body: adjustStockSchema }),
  inventoryController.adjustStock,
);

export default router;
