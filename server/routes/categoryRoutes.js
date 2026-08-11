import { Router } from 'express';
import * as categoryController from '../controllers/categoryController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { tenantMiddleware } from '../middleware/tenantMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  categoryListQuerySchema,
  categoryParamsSchema,
  createCategorySchema,
  updateCategorySchema,
} from '../validators/categoryValidator.js';

const router = Router();
const canEdit = requireRole('OWNER', 'MANAGER');

router.use(authMiddleware, tenantMiddleware);

router.get('/', validate({ query: categoryListQuerySchema }), categoryController.list);
router.post('/', canEdit, validate({ body: createCategorySchema }), categoryController.create);
router.patch(
  '/:categoryId',
  canEdit,
  validate({ params: categoryParamsSchema, body: updateCategorySchema }),
  categoryController.update,
);
router.delete(
  '/:categoryId',
  canEdit,
  validate({ params: categoryParamsSchema }),
  categoryController.remove,
);

export default router;
