import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { requestId } from './middleware/requestId.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { errorMiddleware, notFound } from './middleware/errorMiddleware.js';
import authRoutes from './routes/authRoutes.js';
import organizationRoutes from './routes/organizationRoutes.js';
import memberRoutes from './routes/memberRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import productRoutes from './routes/productRoutes.js';
import inventoryRoutes from './routes/inventoryRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import demoRoutes from './routes/demoRoutes.js';

export const app = express();

app.set('trust proxy', env.TRUST_PROXY);
app.disable('x-powered-by');

// The default policy is default-src 'self', which is right for a JSON API and
// wrong the moment Express also serves the app. Razorpay's checkout loads a
// script and opens an iframe, and product images come from Cloudinary, so both
// are named here rather than discovered when the deployed demo breaks.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'script-src': ["'self'", 'https://checkout.razorpay.com'],
        'frame-src': ["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com'],
        'connect-src': ["'self'", 'https://api.razorpay.com', 'https://lumberjack.razorpay.com'],
        'img-src': [
          "'self'",
          'data:',
          'blob:',
          'https://res.cloudinary.com',
          'https://cdn.razorpay.com',
        ],
      },
    },
  }),
);
app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
app.use(
  express.json({
    limit: '100kb',
    // Razorpay signs the exact bytes it sends, so the webhook needs them as they
    // arrived. Re-serialising the parsed object would change key order or
    // spacing and the signature would never match.
    verify: (req, res, buffer) => {
      req.rawBody = buffer;
    },
  }),
);
app.use(cookieParser());
app.use(requestId);
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => req.id,
    customLogLevel: (req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
    serializers: {
      req: (req) => ({ method: req.method, url: req.url }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  }),
);

// Placed above the limiter so uptime checks are never throttled.
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
});

app.use(globalLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/demo', demoRoutes);

// One origin in production: Express serves the built React bundle alongside the
// API. That is what keeps the refresh cookie at SameSite=Strict, which a
// separate frontend host would break. In development Vite serves the app and
// proxies /api here, so this never runs.
if (env.NODE_ENV === 'production') {
  const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../frontend/dist');

  // index:false so the fallback below decides when to hand out the shell, and a
  // long max-age because Vite fingerprints every asset filename.
  app.use(express.static(clientDir, { index: false, maxAge: '1y' }));

  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) {
      next();
      return;
    }
    // Client-side routes are not files. The shell is never cached, or a deploy
    // would leave browsers asking for asset names that no longer exist.
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(clientDir, 'index.html'));
  });
}

app.use(notFound);
app.use(errorMiddleware);
