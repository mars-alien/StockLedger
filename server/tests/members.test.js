import { beforeEach, describe, expect, it } from 'vitest';
import { addMember, api, createOwnerWithOrganization, registerUser } from './helpers/api.js';
import * as invitationModel from '../models/invitationModel.js';
import * as memberService from '../services/memberService.js';
import { daysFromNow, randomToken } from '../utils/generateToken.js';

let owner;

async function pendingInvitation({ email, role = 'STAFF', expiresAt = daysFromNow(7) }) {
  const { token, tokenHash } = randomToken();
  await invitationModel.create({
    organizationId: owner.organization.id,
    email,
    role,
    tokenHash,
    expiresAt,
  });
  return token;
}

function joinOrganization({ name, email, role }) {
  return addMember({ organizationId: owner.organization.id, name, email, role });
}

beforeEach(async () => {
  owner = await createOwnerWithOrganization({
    name: 'Asha Rao',
    email: 'asha@example.com',
    organizationName: 'Asha Traders',
  });
});

describe('inviting members', () => {
  it('creates a pending invitation', async () => {
    const response = await api()
      .post('/api/members/invitations')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: 'new@example.com', role: 'MANAGER' });

    expect(response.status).toBe(201);
    expect(response.body.email).toBe('new@example.com');
    expect(response.body.inviteUrl).toContain('/accept-invitation?token=');

    const pending = await api()
      .get('/api/members/invitations')
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(pending.body.total).toBe(1);
  });

  it('hands over the link once and never again', async () => {
    const created = await api()
      .post('/api/members/invitations')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: 'new@example.com', role: 'STAFF' });

    expect(created.body.tokenHash).toBeUndefined();

    // Only a hash is stored, so no later request can reproduce the link.
    const pending = await api()
      .get('/api/members/invitations')
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(pending.body.data[0].inviteUrl).toBeUndefined();
    expect(pending.body.data[0].tokenHash).toBeUndefined();
  });

  it('produces a link that actually works', async () => {
    const created = await api()
      .post('/api/members/invitations')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: 'new@example.com', role: 'MANAGER' });

    const token = new URL(created.body.inviteUrl).searchParams.get('token');

    const accepted = await api()
      .post('/api/auth/accept-invitation')
      .send({ token, name: 'New Person', password: 'password123' });

    expect(accepted.status).toBe(201);
    expect(accepted.body.organization.role).toBe('MANAGER');
  });

  it('refuses to invite somebody who is already a member', async () => {
    const response = await api()
      .post('/api/members/invitations')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: 'asha@example.com', role: 'STAFF' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ALREADY_MEMBER');
  });

  it('refuses a second invitation for the same email', async () => {
    await pendingInvitation({ email: 'new@example.com' });

    const response = await api()
      .post('/api/members/invitations')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: 'new@example.com', role: 'STAFF' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INVITATION_PENDING');
  });

  it('revokes a pending invitation', async () => {
    const created = await api()
      .post('/api/members/invitations')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: 'new@example.com', role: 'STAFF' });

    const response = await api()
      .delete(`/api/members/invitations/${created.body.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(response.status).toBe(204);
  });
});

describe('accepting an invitation', () => {
  it('describes the invitation before it is accepted', async () => {
    const token = await pendingInvitation({ email: 'new@example.com', role: 'MANAGER' });

    const response = await api().get(`/api/auth/invitations/${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      email: 'new@example.com',
      role: 'MANAGER',
      organizationName: 'Asha Traders',
      requiresRegistration: true,
    });
  });

  it('creates the account, the membership and a session', async () => {
    const token = await pendingInvitation({ email: 'new@example.com', role: 'MANAGER' });

    const response = await api()
      .post('/api/auth/accept-invitation')
      .send({ token, name: 'New Person', password: 'password123' });

    expect(response.status).toBe(201);
    expect(response.body.organization.role).toBe('MANAGER');
    expect(response.body.accessToken).toBeTruthy();
  });

  it('will not accept the same invitation twice', async () => {
    const token = await pendingInvitation({ email: 'new@example.com' });
    await api()
      .post('/api/auth/accept-invitation')
      .send({ token, name: 'New Person', password: 'password123' });

    const response = await api()
      .post('/api/auth/accept-invitation')
      .send({ token, name: 'New Person', password: 'password123' });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('INVITATION_INVALID');
  });

  it('rejects an expired invitation', async () => {
    const token = await pendingInvitation({
      email: 'new@example.com',
      expiresAt: daysFromNow(-1),
    });

    const response = await api()
      .post('/api/auth/accept-invitation')
      .send({ token, name: 'New Person', password: 'password123' });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('INVITATION_INVALID');
  });

  it('makes an existing account prove itself before joining', async () => {
    await registerUser({ name: 'Existing Person', email: 'existing@example.com' });
    const token = await pendingInvitation({ email: 'existing@example.com', role: 'STAFF' });

    const wrongPassword = await api()
      .post('/api/auth/accept-invitation')
      .send({ token, password: 'not-the-password' });

    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');

    const correctPassword = await api()
      .post('/api/auth/accept-invitation')
      .send({ token, password: 'password123' });

    expect(correctPassword.status).toBe(201);
    expect(correctPassword.body.organization.role).toBe('STAFF');
  });

  it('asks an unknown email for a name and password', async () => {
    const token = await pendingInvitation({ email: 'new@example.com' });

    const response = await api().post('/api/auth/accept-invitation').send({ token });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('REGISTRATION_REQUIRED');
  });
});

describe('role restrictions', () => {
  it('blocks a manager from the member list', async () => {
    const manager = await joinOrganization({
      name: 'Manager Person',
      email: 'manager@example.com',
      role: 'MANAGER',
    });

    const response = await api()
      .get('/api/members')
      .set('Authorization', `Bearer ${manager.accessToken}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('blocks staff from inviting people', async () => {
    const staff = await joinOrganization({
      name: 'Staff Person',
      email: 'staff@example.com',
      role: 'STAFF',
    });

    const response = await api()
      .post('/api/members/invitations')
      .set('Authorization', `Bearer ${staff.accessToken}`)
      .send({ email: 'another@example.com', role: 'STAFF' });

    expect(response.status).toBe(403);
  });
});

describe('changing and removing members', () => {
  it('changes another member role', async () => {
    const staff = await joinOrganization({
      name: 'Staff Person',
      email: 'staff@example.com',
      role: 'STAFF',
    });
    const members = await api()
      .get('/api/members')
      .set('Authorization', `Bearer ${owner.accessToken}`);
    const membership = members.body.data.find((row) => row.user.id === staff.user.id);

    const response = await api()
      .patch(`/api/members/${membership.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ role: 'MANAGER' });

    expect(response.status).toBe(200);
    expect(response.body.role).toBe('MANAGER');
  });

  it('removes another member', async () => {
    const staff = await joinOrganization({
      name: 'Staff Person',
      email: 'staff@example.com',
      role: 'STAFF',
    });
    const members = await api()
      .get('/api/members')
      .set('Authorization', `Bearer ${owner.accessToken}`);
    const membership = members.body.data.find((row) => row.user.id === staff.user.id);

    const response = await api()
      .delete(`/api/members/${membership.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(response.status).toBe(204);
  });

  it('will not let an owner remove themselves', async () => {
    const members = await api()
      .get('/api/members')
      .set('Authorization', `Bearer ${owner.accessToken}`);

    const response = await api()
      .delete(`/api/members/${members.body.data[0].id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('CANNOT_MODIFY_SELF');
  });

  // The self-modification guard means the API cannot normally reach this case,
  // so the rule is checked where it lives. It still matters: an access token
  // issued before a demotion stays valid for its full fifteen minutes.
  it('keeps at least one owner', async () => {
    const manager = await joinOrganization({
      name: 'Manager Person',
      email: 'manager@example.com',
      role: 'MANAGER',
    });
    const members = await api()
      .get('/api/members')
      .set('Authorization', `Bearer ${owner.accessToken}`);
    const ownerMembership = members.body.data.find((row) => row.role === 'OWNER');

    await expect(
      memberService.changeRole({
        organizationId: owner.organization.id,
        actorUserId: manager.user.id,
        membershipId: ownerMembership.id,
        role: 'STAFF',
      }),
    ).rejects.toMatchObject({ code: 'LAST_OWNER', statusCode: 409 });
  });
});
