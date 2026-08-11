import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { withTransaction } from '../config/db.js';
import * as userModel from '../models/userModel.js';
import * as membershipModel from '../models/membershipModel.js';
import * as refreshTokenModel from '../models/refreshTokenModel.js';
import * as invitationModel from '../models/invitationModel.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import { REFRESH_REUSE_GRACE_MS } from '../config/constants.js';
import { daysFromNow, hashToken, randomToken, signAccessToken } from '../utils/generateToken.js';

const BCRYPT_ROUNDS = 12;

export async function register({ name, email, password }) {
  const normalisedEmail = email.trim().toLowerCase();

  if (await userModel.findByEmail(normalisedEmail)) {
    throw new AppError('EMAIL_TAKEN', 409, 'An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  return withTransaction(async (tx) => {
    const user = await userModel.create({ name, email: normalisedEmail, passwordHash }, tx);
    const session = await startSession(user, null, tx);
    return { user: publicUser(user), organization: null, ...session };
  });
}

export async function login({ email, password, ip }) {
  const user = await userModel.findByEmail(email.trim().toLowerCase());
  const passwordMatches = user ? await bcrypt.compare(password, user.passwordHash) : false;

  if (!passwordMatches) {
    logger.warn({ email, ip }, 'login failed');
    throw new AppError('INVALID_CREDENTIALS', 401, 'Email or password is incorrect');
  }

  const membership = await membershipModel.findDefaultForUser(user.id);
  const session = await startSession(user, membership);
  logger.info({ userId: user.id, ip }, 'login succeeded');

  return {
    user: publicUser(user),
    organization: membership ? publicOrganization(membership) : null,
    ...session,
  };
}

export async function refresh({ refreshToken, organizationId }) {
  if (!refreshToken) {
    throw new AppError('UNAUTHENTICATED', 401, 'Missing refresh token');
  }

  // Reading the token, deciding what it is, and rotating it all happen under a
  // row lock. Apart they are three steps two tabs can interleave, and both come
  // away believing they rotated a fresh token: one family, two live tokens, and
  // a rotation chain that records only whichever wrote last.
  const outcome = await withTransaction(async (tx) => {
    const stored = await refreshTokenModel.lockByHash(hashToken(refreshToken), tx);
    if (!stored) {
      return { kind: 'unknown' };
    }

    // A rotated token should never come back. If it does, either it leaked or
    // the session was cloned, and there is no way to tell the attacker from the
    // real user — so every token descended from that login is revoked at once.
    // The one exception is a token rotated moments ago whose replacement is
    // still live, which is two tabs refreshing together rather than an attack.
    if (stored.replacedById || stored.revokedAt) {
      if (await isConcurrentRefresh(stored, tx)) {
        return { kind: 'raced', session: await buildSession(stored, organizationId, tx) };
      }

      await refreshTokenModel.revokeFamily(stored.familyId, tx);
      return { kind: 'reuse', userId: stored.userId, familyId: stored.familyId };
    }

    if (stored.expiresAt <= new Date()) {
      return { kind: 'expired' };
    }

    const session = await buildSession(stored, organizationId, tx);
    if (!session) {
      return { kind: 'unknown' };
    }

    const rotated = await issueRefreshToken(stored.userId, stored.familyId, tx);
    await refreshTokenModel.markReplaced(stored.id, rotated.id, tx);

    return {
      kind: 'rotated',
      session: {
        ...session,
        refreshToken: rotated.token,
        refreshTokenExpiresAt: rotated.expiresAt,
      },
    };
  });

  // Thrown after the commit, so the revocation a reuse triggers actually sticks
  // instead of being rolled back with the error.
  if (outcome.kind === 'reuse') {
    logger.warn(
      { userId: outcome.userId, familyId: outcome.familyId },
      'refresh token reuse detected, family revoked',
    );
    throw new AppError('TOKEN_REUSE_DETECTED', 401, 'Session revoked, sign in again');
  }
  if (outcome.kind === 'expired') {
    throw new AppError('REFRESH_TOKEN_EXPIRED', 401, 'Session expired, sign in again');
  }
  if (outcome.kind === 'unknown') {
    throw new AppError('INVALID_REFRESH_TOKEN', 401, 'Refresh token is not recognised');
  }

  return outcome.session;
}

// No new refresh token on the raced path: the browser already holds the one
// this token was replaced by, and issuing another would rotate the live session
// out from under the tab that legitimately won.
async function buildSession(stored, organizationId, client) {
  const user = await userModel.findById(stored.userId, client);
  if (!user) {
    return null;
  }

  const membership = await resolveMembership(stored.userId, organizationId, client);
  return {
    user: publicUser(user),
    organization: membership ? publicOrganization(membership) : null,
    accessToken: accessTokenFor(user, membership),
  };
}

export async function logout({ refreshToken }) {
  if (!refreshToken) {
    return;
  }
  const stored = await refreshTokenModel.findByHash(hashToken(refreshToken));
  if (stored) {
    await refreshTokenModel.revokeFamily(stored.familyId);
  }
}

export async function me({ userId, organizationId }) {
  const user = await userModel.findById(userId);
  if (!user) {
    throw new AppError('UNAUTHENTICATED', 401, 'Account no longer exists');
  }

  const membership = organizationId
    ? await membershipModel.findByUserAndOrganization(userId, organizationId)
    : null;

  return {
    user: publicUser(user),
    organization: membership ? publicOrganization(membership) : null,
    role: membership?.role ?? null,
  };
}

export async function previewInvitation({ token }) {
  const invitation = await requirePendingInvitation(token);
  const existingUser = await userModel.findByEmail(invitation.email);

  return {
    email: invitation.email,
    role: invitation.role,
    organizationName: invitation.organization.name,
    requiresRegistration: !existingUser,
  };
}

export async function acceptInvitation({ token, name, password }) {
  const invitation = await requirePendingInvitation(token);
  const existingUser = await userModel.findByEmail(invitation.email);

  if (!existingUser && !(name && password)) {
    throw new AppError(
      'REGISTRATION_REQUIRED',
      400,
      'Set a name and password to create your account',
    );
  }

  // The link only proves the invitee can read that mailbox. Joining an account
  // that already exists, and getting a session for it, still needs the password.
  if (existingUser) {
    if (!password) {
      throw new AppError('PASSWORD_REQUIRED', 400, 'Enter your password to join');
    }
    if (!(await bcrypt.compare(password, existingUser.passwordHash))) {
      throw new AppError('INVALID_CREDENTIALS', 401, 'Email or password is incorrect');
    }
  }

  const passwordHash = existingUser ? null : await bcrypt.hash(password, BCRYPT_ROUNDS);

  return withTransaction(async (tx) => {
    const account =
      existingUser ?? (await userModel.create({ name, email: invitation.email, passwordHash }, tx));

    const created = await membershipModel.create(
      { userId: account.id, organizationId: invitation.organizationId, role: invitation.role },
      tx,
    );
    await invitationModel.markAccepted(invitation.id, tx);

    const membership = { ...created, organization: invitation.organization };
    const session = await startSession(account, membership, tx);

    return {
      user: publicUser(account),
      organization: publicOrganization(membership),
      ...session,
    };
  });
}

// Benign only when all three hold: it really was rotated, that happened within
// the grace window, and the token it was rotated into is still the live tip of
// the family. If the family has since been revoked, this is not a race.
async function isConcurrentRefresh(stored, client) {
  if (!stored.replacedById || !stored.revokedAt) {
    return false;
  }
  if (Date.now() - stored.revokedAt.getTime() > REFRESH_REUSE_GRACE_MS) {
    return false;
  }

  const replacement = await refreshTokenModel.findById(stored.replacedById, client);
  return Boolean(replacement && !replacement.revokedAt);
}

async function requirePendingInvitation(token) {
  const invitation = await invitationModel.findByTokenHash(hashToken(token));

  if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) {
    throw new AppError('INVITATION_INVALID', 404, 'This invitation is no longer valid');
  }
  return invitation;
}

async function resolveMembership(userId, organizationId, client) {
  if (!organizationId) {
    return membershipModel.findDefaultForUser(userId, client);
  }

  const membership = await membershipModel.findByUserAndOrganization(
    userId,
    organizationId,
    client,
  );
  if (!membership) {
    throw new AppError('FORBIDDEN', 403, 'You are not a member of that organization');
  }
  return membership;
}

// A fresh login starts a new token family; every rotation after it stays in the
// same family so reuse can be traced back to one sign-in.
async function startSession(user, membership, client) {
  const created = await issueRefreshToken(user.id, crypto.randomUUID(), client);
  return {
    accessToken: accessTokenFor(user, membership),
    refreshToken: created.token,
    refreshTokenExpiresAt: created.expiresAt,
  };
}

async function issueRefreshToken(userId, familyId, client) {
  const { token, tokenHash } = randomToken();
  const expiresAt = daysFromNow(env.REFRESH_TOKEN_TTL_DAYS);
  const row = await refreshTokenModel.create({ userId, tokenHash, familyId, expiresAt }, client);
  return { id: row.id, token, expiresAt };
}

function accessTokenFor(user, membership) {
  return signAccessToken({
    userId: user.id,
    organizationId: membership?.organizationId ?? null,
    role: membership?.role ?? null,
  });
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
}

function publicOrganization(membership) {
  return {
    id: membership.organization.id,
    name: membership.organization.name,
    slug: membership.organization.slug,
    role: membership.role,
  };
}
