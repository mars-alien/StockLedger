import * as authService from '../services/authService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { env } from '../config/env.js';

const REFRESH_COOKIE = 'refreshToken';

// Path is limited to the auth routes so the refresh token is not attached to
// every API call, and SameSite=Strict means the browser never sends it from
// another site, which is what removes the CSRF exposure on refresh.
const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/api/auth',
};

export const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.validated.body);
  sendSession(res, result, 201);
});

export const login = asyncHandler(async (req, res) => {
  const result = await authService.login({ ...req.validated.body, ip: req.ip });
  sendSession(res, result, 200);
});

export const refresh = asyncHandler(async (req, res) => {
  const result = await authService.refresh({
    refreshToken: req.cookies[REFRESH_COOKIE],
    organizationId: req.validated.body.organizationId,
  });
  sendSession(res, result, 200);
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logout({ refreshToken: req.cookies[REFRESH_COOKIE] });
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
  res.status(204).end();
});

export const me = asyncHandler(async (req, res) => {
  const result = await authService.me({
    userId: req.user.id,
    organizationId: req.user.organizationId,
  });
  res.json(result);
});

export const previewInvitation = asyncHandler(async (req, res) => {
  const result = await authService.previewInvitation(req.validated.params);
  res.json(result);
});

export const acceptInvitation = asyncHandler(async (req, res) => {
  const result = await authService.acceptInvitation(req.validated.body);
  sendSession(res, result, 201);
});

function sendSession(res, result, status) {
  // A refresh that lost a race to another tab returns an access token without a
  // new refresh token, because the browser already holds the live one.
  if (result.refreshToken) {
    res.cookie(REFRESH_COOKIE, result.refreshToken, {
      ...cookieOptions,
      expires: result.refreshTokenExpiresAt,
    });
  }

  res.status(status).json({
    user: result.user,
    organization: result.organization,
    accessToken: result.accessToken,
  });
}
