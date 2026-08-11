import { describe, expect, it } from 'vitest';
import { api, refreshCookie, registerUser } from './helpers/api.js';

describe('registration and login', () => {
  it('creates an account and returns a session', async () => {
    const response = await api()
      .post('/api/auth/register')
      .send({ name: 'Asha Rao', email: 'asha@example.com', password: 'password123' });

    expect(response.status).toBe(201);
    expect(response.body.accessToken).toBeTruthy();
    expect(response.body.user.email).toBe('asha@example.com');
    expect(response.body.user.passwordHash).toBeUndefined();
    expect(refreshCookie(response)).toBeTruthy();
  });

  it('sends the refresh token as an httpOnly cookie and never in the body', async () => {
    const response = await api()
      .post('/api/auth/register')
      .send({ name: 'Asha Rao', email: 'asha@example.com', password: 'password123' });

    const cookie = response.headers['set-cookie'].find((value) =>
      value.startsWith('refreshToken='),
    );

    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(response.body.refreshToken).toBeUndefined();
  });

  it('rejects a duplicate email', async () => {
    await registerUser({ name: 'Asha Rao', email: 'asha@example.com' });

    const response = await api()
      .post('/api/auth/register')
      .send({ name: 'Someone Else', email: 'asha@example.com', password: 'password123' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('rejects a weak password before it reaches the service', async () => {
    const response = await api()
      .post('/api/auth/register')
      .send({ name: 'Asha Rao', email: 'asha@example.com', password: 'short' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details[0].field).toBe('password');
  });

  it('rejects the wrong password without revealing which field was wrong', async () => {
    await registerUser({ name: 'Asha Rao', email: 'asha@example.com' });

    const response = await api()
      .post('/api/auth/login')
      .send({ email: 'asha@example.com', password: 'not-the-password' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('signs in an existing account', async () => {
    await registerUser({ name: 'Asha Rao', email: 'asha@example.com' });

    const response = await api()
      .post('/api/auth/login')
      .send({ email: 'asha@example.com', password: 'password123' });

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBeTruthy();
  });
});

describe('refresh token rotation', () => {
  it('issues a new refresh token on every refresh', async () => {
    const owner = await registerUser({ name: 'Asha Rao', email: 'asha@example.com' });

    const response = await api().post('/api/auth/refresh').set('Cookie', owner.cookie);
    const rotated = refreshCookie(response);

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBeTruthy();
    expect(rotated).not.toBe(owner.cookie);
  });

  it('treats two tabs refreshing at once as a race, not an attack', async () => {
    const owner = await registerUser({ name: 'Asha Rao', email: 'asha@example.com' });

    // Both tabs read the same cookie before either response came back.
    const [first, second] = await Promise.all([
      api().post('/api/auth/refresh').set('Cookie', owner.cookie),
      api().post('/api/auth/refresh').set('Cookie', owner.cookie),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.accessToken).toBeTruthy();
    expect(second.body.accessToken).toBeTruthy();

    // Exactly one of them rotated the cookie; the loser left it alone.
    const rotated = [refreshCookie(first), refreshCookie(second)].filter(Boolean);
    expect(rotated).toHaveLength(1);

    // And the session still works afterwards.
    const next = await api().post('/api/auth/refresh').set('Cookie', rotated[0]);
    expect(next.status).toBe(200);
  });

  it('revokes the whole family when a rotated token is presented again', async () => {
    const owner = await registerUser({ name: 'Asha Rao', email: 'asha@example.com' });

    // Two rotations, so the original is not merely stale but has been overtaken
    // twice. That is a replay rather than two tabs racing.
    const first = await api().post('/api/auth/refresh').set('Cookie', owner.cookie);
    const second = await api().post('/api/auth/refresh').set('Cookie', refreshCookie(first));
    const live = refreshCookie(second);

    const reuse = await api().post('/api/auth/refresh').set('Cookie', owner.cookie);

    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('TOKEN_REUSE_DETECTED');

    // The token the honest client is holding dies with the rest of the family,
    // which is the point: the session cannot be continued by either party.
    const afterRevocation = await api().post('/api/auth/refresh').set('Cookie', live);
    expect(afterRevocation.status).toBe(401);
  });

  it('refuses an unknown refresh token', async () => {
    const response = await api()
      .post('/api/auth/refresh')
      .set('Cookie', 'refreshToken=not-a-real-token');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('refuses a refresh with no cookie at all', async () => {
    const response = await api().post('/api/auth/refresh');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('ends the session on logout', async () => {
    const owner = await registerUser({ name: 'Asha Rao', email: 'asha@example.com' });

    const loggedOut = await api().post('/api/auth/logout').set('Cookie', owner.cookie);
    expect(loggedOut.status).toBe(204);

    const afterLogout = await api().post('/api/auth/refresh').set('Cookie', owner.cookie);
    expect(afterLogout.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('needs an access token', async () => {
    const response = await api().get('/api/auth/me');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a tampered access token', async () => {
    const response = await api().get('/api/auth/me').set('Authorization', 'Bearer nonsense.token');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_TOKEN');
  });

  it('returns the signed-in user', async () => {
    const owner = await registerUser({ name: 'Asha Rao', email: 'asha@example.com' });

    const response = await api()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe('asha@example.com');
    expect(response.body.organization).toBeNull();
  });
});
