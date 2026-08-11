import { Router } from 'express';
import * as demoController from '../controllers/demoController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { tenantMiddleware } from '../middleware/tenantMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';
import { demoLimiter } from '../middleware/rateLimit.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

const router = Router();

// An endpoint that writes negative stock on purpose has no business existing in
// a deployment that has not asked for it. Off means gone, not merely refused.
router.use((req, res, next) => {
  if (!env.DEMO_ENDPOINTS_ENABLED) {
    throw new AppError('NOT_FOUND', 404, `Cannot ${req.method} ${req.originalUrl}`);
  }
  next();
});

router.use(demoLimiter, authMiddleware, tenantMiddleware, requireRole('OWNER', 'MANAGER'));

router.get('/state', demoController.getState);
router.post('/reset', demoController.reset);
router.post('/orders-unsafe', demoController.placeUnsafeOrder);

export default router;
