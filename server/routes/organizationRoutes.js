import { Router } from 'express';
import * as organizationController from '../controllers/organizationController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { tenantMiddleware } from '../middleware/tenantMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  createOrganizationSchema,
  organizationListQuerySchema,
  organizationParamsSchema,
} from '../validators/organizationValidator.js';

const router = Router();

router.use(authMiddleware);

router.post('/', validate({ body: createOrganizationSchema }), organizationController.create);
router.get('/', validate({ query: organizationListQuerySchema }), organizationController.list);
router.get('/current', tenantMiddleware, organizationController.current);
router.post(
  '/:organizationId/switch',
  validate({ params: organizationParamsSchema }),
  organizationController.switchTo,
);

export default router;
