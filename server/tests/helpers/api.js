import request from 'supertest';
import { app } from '../../app.js';
import * as membershipModel from '../../models/membershipModel.js';

export function api() {
  return request(app);
}

export function refreshCookie(response) {
  const header = response.headers['set-cookie'] ?? [];
  const cookie = header.find((value) => value.startsWith('refreshToken='));
  return cookie ? cookie.split(';')[0] : null;
}

export async function registerUser({ name, email, password = 'password123' }) {
  const response = await api().post('/api/auth/register').send({ name, email, password });
  return {
    user: response.body.user,
    accessToken: response.body.accessToken,
    cookie: refreshCookie(response),
    password,
  };
}

export async function createOrganization(accessToken, name) {
  const response = await api()
    .post('/api/organizations')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name });

  return {
    organization: response.body.organization,
    accessToken: response.body.accessToken,
  };
}

// Registers an owner and gives them an organization in one step, which is the
// starting point for almost every suite.
export async function createOwnerWithOrganization({ name, email, organizationName }) {
  const owner = await registerUser({ name, email });
  const { organization, accessToken } = await createOrganization(
    owner.accessToken,
    organizationName,
  );
  return { user: owner.user, organization, accessToken, cookie: owner.cookie };
}

// The membership is written directly because the invitation email carries the
// only copy of the token, and a test has no mailbox to read it from.
export async function addMember({ organizationId, name, email, role }) {
  const account = await registerUser({ name, email });
  await membershipModel.create({ userId: account.user.id, organizationId, role });

  const signedIn = await api().post('/api/auth/login').send({ email, password: account.password });
  return { user: account.user, accessToken: signedIn.body.accessToken };
}
