import { Router } from 'express';
import * as authController from '../controllers/authController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { loginLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import {
  acceptInvitationSchema,
  invitationTokenParamsSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
} from '../validators/authValidator.js';

const router = Router();

router.post('/register', validate({ body: registerSchema }), authController.register);
router.post('/login', loginLimiter, validate({ body: loginSchema }), authController.login);
router.post('/refresh', validate({ body: refreshSchema }), authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', authMiddleware, authController.me);

router.get(
  '/invitations/:token',
  validate({ params: invitationTokenParamsSchema }),
  authController.previewInvitation,
);
router.post(
  '/accept-invitation',
  validate({ body: acceptInvitationSchema }),
  authController.acceptInvitation,
);

export default router;
