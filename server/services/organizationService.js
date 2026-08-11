import crypto from 'node:crypto';
import { withTransaction } from '../config/db.js';
import * as organizationModel from '../models/organizationModel.js';
import * as membershipModel from '../models/membershipModel.js';
import * as auditLogModel from '../models/auditLogModel.js';
import { TAX_RATE_BASIS_POINTS } from '../config/constants.js';
import { AppError } from '../utils/AppError.js';
import { signAccessToken } from '../utils/generateToken.js';
import { toPage, toSkipTake } from '../utils/pagination.js';
import { toSlug } from '../utils/slug.js';

export async function create({ userId, name }) {
  const slug = await uniqueSlug(name);

  const { organization, role } = await withTransaction(async (tx) => {
    const created = await organizationModel.create({ name, slug }, tx);
    const membership = await membershipModel.create(
      { userId, organizationId: created.id, role: 'OWNER' },
      tx,
    );
    await auditLogModel.record(
      {
        organizationId: created.id,
        actorUserId: userId,
        action: 'organization.created',
        entityType: 'Organization',
        entityId: created.id,
        after: { name: created.name, slug: created.slug },
      },
      tx,
    );
    return { organization: created, role: membership.role };
  });

  // The caller's current access token has no organization in it, so a new one is
  // issued here rather than making the client sign in again.
  return {
    organization: { ...toPublic(organization), role },
    accessToken: signAccessToken({ userId, organizationId: organization.id, role }),
  };
}

export async function listForUser({ userId, page, limit }) {
  const { skip, take } = toSkipTake({ page, limit });
  const [organizations, total] = await Promise.all([
    organizationModel.listForUser(userId, { skip, take }),
    organizationModel.countForUser(userId),
  ]);

  return toPage({ data: organizations.map(toPublic), total, page, limit });
}

export async function current({ userId, organizationId }) {
  const membership = await membershipModel.findByUserAndOrganization(userId, organizationId);
  if (!membership) {
    throw new AppError('NOT_FOUND', 404, 'Organization not found');
  }

  // The tax rate travels with the organization so the create-order screen can
  // preview a total without keeping its own copy of the rate. Two copies drift,
  // and the one on screen would quietly stop matching the one that bills.
  return {
    ...toPublic(membership.organization),
    role: membership.role,
    taxRateBasisPoints: TAX_RATE_BASIS_POINTS,
  };
}

export async function switchTo({ userId, organizationId }) {
  const membership = await membershipModel.findByUserAndOrganization(userId, organizationId);
  if (!membership) {
    throw new AppError('NOT_FOUND', 404, 'Organization not found');
  }

  return {
    organization: { ...toPublic(membership.organization), role: membership.role },
    accessToken: signAccessToken({ userId, organizationId, role: membership.role }),
  };
}

// Organization slugs are global, so a clash is likely and gets a suffix rather
// than an error. Category slugs are scoped to one organization and a clash
// there is a genuine mistake, which is why that path rejects instead.
async function uniqueSlug(name) {
  const base = toSlug(name);

  if (!(await organizationModel.findBySlug(base))) {
    return base;
  }
  return `${base}-${crypto.randomBytes(3).toString('hex')}`;
}

function toPublic(organization) {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    createdAt: organization.createdAt,
  };
}
