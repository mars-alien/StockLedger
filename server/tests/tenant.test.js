import { beforeEach, describe, expect, it } from 'vitest';
import { api, createOwnerWithOrganization } from './helpers/api.js';
import * as membershipModel from '../models/membershipModel.js';

let asha;
let vikram;

async function membershipIdOf(account) {
  const response = await api()
    .get('/api/members')
    .set('Authorization', `Bearer ${account.accessToken}`);
  return response.body.data[0].id;
}

beforeEach(async () => {
  asha = await createOwnerWithOrganization({
    name: 'Asha Rao',
    email: 'asha@example.com',
    organizationName: 'Asha Traders',
  });
  vikram = await createOwnerWithOrganization({
    name: 'Vikram Nair',
    email: 'vikram@example.com',
    organizationName: 'Nair Supplies',
  });
});

describe('organization isolation', () => {
  it('lists only the organizations the caller belongs to', async () => {
    const response = await api()
      .get('/api/organizations')
      .set('Authorization', `Bearer ${asha.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(asha.organization.id);
  });

  it('returns the caller own organization from /current', async () => {
    const response = await api()
      .get('/api/organizations/current')
      .set('Authorization', `Bearer ${asha.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(asha.organization.id);
  });

  it('refuses to switch into an organization the caller does not belong to', async () => {
    const response = await api()
      .post(`/api/organizations/${vikram.organization.id}/switch`)
      .set('Authorization', `Bearer ${asha.accessToken}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});

describe('member isolation', () => {
  it('lists only members of the caller organization', async () => {
    const response = await api()
      .get('/api/members')
      .set('Authorization', `Bearer ${asha.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.data[0].user.email).toBe('asha@example.com');
  });

  it('returns 404 when changing a role that belongs to another organization', async () => {
    const foreignMembershipId = await membershipIdOf(vikram);

    const response = await api()
      .patch(`/api/members/${foreignMembershipId}`)
      .set('Authorization', `Bearer ${asha.accessToken}`)
      .send({ role: 'STAFF' });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 when removing a member of another organization', async () => {
    const foreignMembershipId = await membershipIdOf(vikram);

    const response = await api()
      .delete(`/api/members/${foreignMembershipId}`)
      .set('Authorization', `Bearer ${asha.accessToken}`);

    expect(response.status).toBe(404);
  });

  it('finds nothing when a model is asked for another organization row', async () => {
    const foreignMembershipId = await membershipIdOf(vikram);

    const wrongTenant = await membershipModel.findById(foreignMembershipId, asha.organization.id);
    const rightTenant = await membershipModel.findById(foreignMembershipId, vikram.organization.id);

    expect(wrongTenant).toBeNull();
    expect(rightTenant).not.toBeNull();
  });
});

describe('requests without an organization', () => {
  it('rejects tenant-scoped routes when the token carries no organization', async () => {
    const orphan = await api()
      .post('/api/auth/register')
      .send({ name: 'No Org', email: 'noorg@example.com', password: 'password123' });

    const response = await api()
      .get('/api/members')
      .set('Authorization', `Bearer ${orphan.body.accessToken}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('NO_ORGANIZATION');
  });
});
