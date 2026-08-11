import { Router } from 'express';
import * as analyticsController from '../controllers/analyticsController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { tenantMiddleware } from '../middleware/tenantMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';
import { validate } from '../middleware/validate.js';
import { dashboardQuerySchema } from '../validators/analyticsValidator.js';

const router = Router();

// Revenue is not staff business, so the whole module is owner and manager only.
router.use(authMiddleware, tenantMiddleware, requireRole('OWNER', 'MANAGER'));

router.get('/dashboard', validate({ query: dashboardQuerySchema }), analyticsController.dashboard);

export default router;
