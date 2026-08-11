import { Router } from 'express';
import * as memberController from '../controllers/memberController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { tenantMiddleware } from '../middleware/tenantMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  changeRoleSchema,
  invitationListQuerySchema,
  invitationParamsSchema,
  inviteMemberSchema,
  memberListQuerySchema,
  membershipParamsSchema,
} from '../validators/memberValidator.js';

const router = Router();

router.use(authMiddleware, tenantMiddleware, requireRole('OWNER'));

router.get('/', validate({ query: memberListQuerySchema }), memberController.list);

router.get(
  '/invitations',
  validate({ query: invitationListQuerySchema }),
  memberController.listInvitations,
);
router.post('/invitations', validate({ body: inviteMemberSchema }), memberController.invite);
router.delete(
  '/invitations/:invitationId',
  validate({ params: invitationParamsSchema }),
  memberController.revokeInvitation,
);

router.patch(
  '/:membershipId',
  validate({ params: membershipParamsSchema, body: changeRoleSchema }),
  memberController.changeRole,
);
router.delete(
  '/:membershipId',
  validate({ params: membershipParamsSchema }),
  memberController.remove,
);

export default router;
