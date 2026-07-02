/**
 * app.ts — Express application factory.
 * Kept separate from server.ts so the app can be imported in tests
 * without binding to a port.
 */

import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import { env } from './config/env';
import { requestId } from './middleware/requestId';
import { notFoundHandler, errorHandler } from './middleware/errorHandler';
import routes from './routes';

// ─── Global rate limiter ──────────────────────────────────────────────────────
// 200 requests per IP per 15 minutes across all routes.
// Auth-specific limiters (10 req/15 min) defined in auth.routes.ts are stricter
// and remain unchanged — they layer on top of this global limit.
const globalLimiter = rateLimit({
  windowMs:       15 * 60 * 1000,   // 15 minutes
  max:            200,
  standardHeaders: true,
  legacyHeaders:  false,
  message: {
    status:  'error',
    code:    'RATE_LIMITED',
    message: 'Too many requests. Please try again later.',
  },
});

export function createApp(): Application {
  const app = express();

  // ── Request tracing — first, so every handler has req.requestId ──────────
  app.use(requestId);

  // ── Security: Helmet (CSP disabled — API-only server) ────────────────────
  app.use(helmet({ contentSecurityPolicy: false }));

  // ── CORS ──────────────────────────────────────────────────────────────────
  const allowedOrigins = env.CORS_ORIGINS.split(',').map(o => o.trim());
  app.use(cors({
    origin: (origin, cb) => {
      // Development: allow requests with no Origin (curl, Postman, server-to-server)
      // Production:  require an explicit Origin that matches the allowlist
      if (!origin) {
        if (env.isDev) return cb(null, true);
        return cb(new Error('CORS: requests without an Origin header are not allowed in production'));
      }
      if (allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  }));

  // ── Parsing & compression ─────────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(compression());

  // ── MongoDB operator injection sanitization ───────────────────────────────
  // Strips keys starting with $ or containing . from req.body, req.query, req.params
  app.use(mongoSanitize());

  // ── Global rate limiter ───────────────────────────────────────────────────
  app.use(globalLimiter);

  // ── API routes ────────────────────────────────────────────────────────────
  app.use('/api/v1', routes);

  // ── 404 & error handlers (must be last) ──────────────────────────────────
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
