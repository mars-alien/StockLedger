import crypto from 'node:crypto';

export function requestId(req, res, next) {
  req.id = crypto.randomBytes(4).toString('hex');
  res.setHeader('X-Request-Id', req.id);
  next();
}
