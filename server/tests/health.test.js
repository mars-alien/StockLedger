import { describe, expect, it } from 'vitest';
import { api } from './helpers/api.js';

describe('GET /api/health', () => {
  it('reports ok without authentication', async () => {
    const response = await api().get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  it('returns a request id on every response', async () => {
    const response = await api().get('/api/health');

    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f]{8}$/);
  });

  // Pinned because the failure mode is invisible in development: Vite serves
  // the app there, so a policy that blocks Razorpay or Cloudinary only shows up
  // once Express is serving the bundle in production.
  it('sends a content security policy that allows checkout and product images', async () => {
    const response = await api().get('/api/health');
    const policy = response.headers['content-security-policy'];

    expect(policy).toContain('script-src');
    expect(policy).toContain('https://checkout.razorpay.com');
    expect(policy).toContain('https://api.razorpay.com');
    expect(policy).toContain('https://res.cloudinary.com');
  });

  it('answers unknown routes with the standard error shape', async () => {
    const response = await api().get('/api/nope');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
  });
});
