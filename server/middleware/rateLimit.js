import rateLimit from 'express-rate-limit';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';

function reject(code, message) {
  return (req, res, next) => next(new AppError(code, 429, message));
}

// The counters live in one process and the whole suite shares an IP, so a test
// run would otherwise throttle itself. The load test turns them off explicitly,
// because no limit a real deployment would want still allows a benchmark.
const disabled = () => env.NODE_ENV === 'test' || !env.RATE_LIMIT_ENABLED;

// The concurrency demo fires fifty orders at once from a single browser. Under
// the global limit those would come back as 429s, which would make the page
// look like it proved something about stock when it only proved something about
// rate limiting.
const isDemoRoute = (req) => req.path.startsWith('/api/demo');

// Per minute rather than per quarter hour. A dashboard makes several calls per
// screen and a shop shares one address, so a limit measured in requests per
// fifteen minutes throttles honest use long before it inconveniences anybody
// worth throttling.
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => disabled() || isDemoRoute(req),
  handler: reject('RATE_LIMITED', 'Too many requests, slow down'),
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: disabled,
  handler: reject('RATE_LIMITED', 'Too many sign-in attempts, try again in 15 minutes'),
});

// Wide enough for a demo run, narrow enough that the endpoint cannot be used as
// a free load generator. Attached to the demo routes in phase 3.
export const demoLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: disabled,
  handler: reject('RATE_LIMITED', 'Slow down and reset the demo before running it again'),
});
