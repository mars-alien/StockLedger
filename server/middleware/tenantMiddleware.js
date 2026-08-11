import { AppError } from '../utils/AppError.js';

// The organization comes from the signed token, never from a header or the URL,
// so a client cannot ask for another tenant's data by editing the request.
export function tenantMiddleware(req, res, next) {
  if (!req.user?.organizationId) {
    throw new AppError('NO_ORGANIZATION', 403, 'Create or select an organization first');
  }
  req.organizationId = req.user.organizationId;
  next();
}
