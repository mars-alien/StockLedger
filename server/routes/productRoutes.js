import { Router } from 'express';
import * as productController from '../controllers/productController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { tenantMiddleware } from '../middleware/tenantMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';
import { validate } from '../middleware/validate.js';
import { productImageUpload } from '../middleware/upload.js';
import {
  createProductSchema,
  createVariantSchema,
  productListQuerySchema,
  productParamsSchema,
  updateProductSchema,
  updateVariantSchema,
  variantParamsSchema,
} from '../validators/productValidator.js';

const router = Router();
const canEdit = requireRole('OWNER', 'MANAGER');

router.use(authMiddleware, tenantMiddleware);

router.get('/', validate({ query: productListQuerySchema }), productController.list);
router.post('/', canEdit, validate({ body: createProductSchema }), productController.create);

router.get('/:productId', validate({ params: productParamsSchema }), productController.get);
router.patch(
  '/:productId',
  canEdit,
  validate({ params: productParamsSchema, body: updateProductSchema }),
  productController.update,
);
router.delete(
  '/:productId',
  canEdit,
  validate({ params: productParamsSchema }),
  productController.remove,
);

router.post(
  '/:productId/image',
  canEdit,
  productImageUpload,
  validate({ params: productParamsSchema }),
  productController.uploadImage,
);

router.post(
  '/:productId/variants',
  canEdit,
  validate({ params: productParamsSchema, body: createVariantSchema }),
  productController.addVariant,
);
router.patch(
  '/:productId/variants/:variantId',
  canEdit,
  validate({ params: variantParamsSchema, body: updateVariantSchema }),
  productController.updateVariant,
);
router.delete(
  '/:productId/variants/:variantId',
  canEdit,
  validate({ params: variantParamsSchema }),
  productController.removeVariant,
);

export default router;
