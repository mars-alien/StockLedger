import { withTransaction } from '../config/db.js';
import * as membershipModel from '../models/membershipModel.js';
import * as invitationModel from '../models/invitationModel.js';
import * as userModel from '../models/userModel.js';
import * as auditLogModel from '../models/auditLogModel.js';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';
import { INVITATION_TTL_DAYS } from '../config/constants.js';
import { daysFromNow, randomToken } from '../utils/generateToken.js';
import { toPage, toSkipTake } from '../utils/pagination.js';

export async function list({ organizationId, page, limit, search }) {
  const { skip, take } = toSkipTake({ page, limit });
  const [members, total] = await Promise.all([
    membershipModel.listByOrganization(organizationId, { skip, take, search }),
    membershipModel.countByOrganization(organizationId, { search }),
  ]);

  return toPage({ data: members, total, page, limit });
}

export async function listInvitations({ organizationId, page, limit }) {
  const { skip, take } = toSkipTake({ page, limit });
  const [invitations, total] = await Promise.all([
    invitationModel.listPending(organizationId, { skip, take }),
    invitationModel.countPending(organizationId),
  ]);

  return toPage({ data: invitations, total, page, limit });
}

export async function invite({ organizationId, actorUserId, email, role }) {
  const normalisedEmail = email.trim().toLowerCase();
  await assertNotAlreadyInvolved(organizationId, normalisedEmail);

  const { token, tokenHash } = randomToken();
  const expiresAt = daysFromNow(INVITATION_TTL_DAYS);

  const invitation = await withTransaction(async (tx) => {
    const created = await invitationModel.create(
      { organizationId, email: normalisedEmail, role, tokenHash, expiresAt },
      tx,
    );
    await auditLogModel.record(
      {
        organizationId,
        actorUserId,
        action: 'member.invited',
        entityType: 'Invitation',
        entityId: created.id,
        after: { email: normalisedEmail, role },
      },
      tx,
    );
    return created;
  });

  // The only time this URL is ever returned. The database keeps a hash, so a
  // lost link cannot be recovered from it and has to be revoked and reissued.
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
    inviteUrl: `${env.APP_URL}/accept-invitation?token=${token}`,
  };
}

export async function revokeInvitation({ organizationId, actorUserId, invitationId }) {
  const invitation = await invitationModel.findPendingById(organizationId, invitationId);
  if (!invitation) {
    throw new AppError('NOT_FOUND', 404, 'Invitation not found');
  }

  await withTransaction(async (tx) => {
    await invitationModel.remove(invitationId, organizationId, tx);
    await auditLogModel.record(
      {
        organizationId,
        actorUserId,
        action: 'member.invitation_revoked',
        entityType: 'Invitation',
        entityId: invitationId,
        before: { email: invitation.email, role: invitation.role },
      },
      tx,
    );
  });
}

export async function changeRole({ organizationId, actorUserId, membershipId, role }) {
  const membership = await requireMember(organizationId, membershipId);

  if (membership.user.id === actorUserId) {
    throw new AppError('CANNOT_MODIFY_SELF', 400, 'You cannot change your own role');
  }
  if (membership.role === 'OWNER' && role !== 'OWNER') {
    await assertNotLastOwner(organizationId);
  }

  return withTransaction(async (tx) => {
    const updated = await membershipModel.updateRole(membershipId, organizationId, role, tx);
    await auditLogModel.record(
      {
        organizationId,
        actorUserId,
        action: 'member.role_changed',
        entityType: 'Membership',
        entityId: membershipId,
        before: { role: membership.role },
        after: { role },
      },
      tx,
    );
    return updated;
  });
}

export async function remove({ organizationId, actorUserId, membershipId }) {
  const membership = await requireMember(organizationId, membershipId);

  if (membership.user.id === actorUserId) {
    throw new AppError('CANNOT_MODIFY_SELF', 400, 'You cannot remove yourself');
  }
  if (membership.role === 'OWNER') {
    await assertNotLastOwner(organizationId);
  }

  await withTransaction(async (tx) => {
    await membershipModel.remove(membershipId, organizationId, tx);
    await auditLogModel.record(
      {
        organizationId,
        actorUserId,
        action: 'member.removed',
        entityType: 'Membership',
        entityId: membershipId,
        before: { userId: membership.user.id, role: membership.role },
      },
      tx,
    );
  });
}

async function requireMember(organizationId, membershipId) {
  const membership = await membershipModel.findById(membershipId, organizationId);
  if (!membership) {
    throw new AppError('NOT_FOUND', 404, 'Member not found');
  }
  return membership;
}

async function assertNotLastOwner(organizationId) {
  const owners = await membershipModel.countByRole(organizationId, 'OWNER');
  if (owners <= 1) {
    throw new AppError('LAST_OWNER', 409, 'An organization must keep at least one owner');
  }
}

async function assertNotAlreadyInvolved(organizationId, email) {
  const user = await userModel.findByEmail(email);
  if (user && (await membershipModel.findByUserAndOrganization(user.id, organizationId))) {
    throw new AppError('ALREADY_MEMBER', 409, 'That person is already a member');
  }
  if (await invitationModel.findPending(organizationId, email)) {
    throw new AppError(
      'INVITATION_PENDING',
      409,
      'An invitation is already pending for that email',
    );
  }
}
