import { AppError } from '../utils/AppError.js';
import { verifyAccessToken } from '../utils/generateToken.js';

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new AppError('UNAUTHENTICATED', 401, 'Missing access token');
  }

  let payload;
  try {
    payload = verifyAccessToken(header.slice('Bearer '.length));
  } catch {
    throw new AppError('INVALID_TOKEN', 401, 'Access token is invalid or expired');
  }

  req.user = {
    id: payload.sub,
    organizationId: payload.organizationId ?? null,
    role: payload.role ?? null,
  };
  next();
}
