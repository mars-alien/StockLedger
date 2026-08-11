import { AppError } from '../utils/AppError.js';

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      throw new AppError('FORBIDDEN', 403, 'Your role does not allow this action');
    }
    next();
  };
}
