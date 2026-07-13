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

  // Render sits behind a reverse proxy
  app.set('trust proxy', 1);

  // ── Request tracing — first, so every handler has req.requestId ──────────
  app.use(requestId);

  // ── Security: Helmet (CSP disabled — API-only server) ────────────────────
  app.use(helmet({ contentSecurityPolicy: false }));

  // ── CORS ──────────────────────────────────────────────────────────────────
  // Origins are allowed when they match any of these rules (in priority order):
  //   1. No origin header  — server-to-server, health checks, Postman
  //   2. localhost devservers  — :3000 (Vite CRA) or :5173 (Vite default)
  //   3. Exact match in CORS_ORIGINS env var  — e.g. production frontend URL
  //   4. Any *.vercel.app subdomain  — covers all Vercel preview deployments
  //      automatically, without manual whitelist updates per deployment
  //
  // `credentials: true` is preserved so cookies / Authorization headers
  // are forwarded correctly on credentialed cross-origin requests.
  //
  // OPTIONS preflight requests are handled automatically by the cors()
  // middleware (it responds 204 before reaching any route handler).

  const allowedOrigins = env.CORS_ORIGINS
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

  const LOCALHOST_ORIGINS = [
    'http://localhost:3000',
    'http://localhost:5173',
  ];

  app.use(cors({
    origin: (origin, cb) => {
      // Rule 1: no Origin header — always allow
      if (!origin) {
        return cb(null, true);
      }

      // Rule 2: localhost dev servers
      if (LOCALHOST_ORIGINS.includes(origin)) {
        return cb(null, true);
      }

      // Rule 3: exact match against CORS_ORIGINS env var
      if (allowedOrigins.includes(origin)) {
        return cb(null, true);
      }

      // Rule 4: any Vercel preview deployment (*.vercel.app)
      if (origin.endsWith('.vercel.app')) {
        return cb(null, true);
      }

      // Blocked — log at warn level so it appears in Render logs
      console.warn(`[CORS] blocked origin: ${origin}`);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials:      true,
    methods:          ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders:   ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders:   ['X-Request-ID'],
    optionsSuccessStatus: 204,   // some legacy browsers choke on 200 for OPTIONS
  }));

  // Explicitly handle OPTIONS preflight for all routes so cors() can
  // respond before any authentication or validation middleware runs.
  app.options('*', cors());

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
