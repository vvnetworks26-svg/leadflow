/**
 * app.ts — Express application factory.
 * Kept separate from server.ts so the app can be imported in tests
 * without binding to a port.
 */

import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { env } from './config/env';
import { requestLogger } from './middleware/requestLogger';
import { notFoundHandler, errorHandler } from './middleware/errorHandler';
import routes from './routes';

export function createApp(): Application {
  const app = express();

  // ── Security ──────────────────────────────────────────────────
  app.use(helmet());

  // ── CORS ──────────────────────────────────────────────────────
  const allowedOrigins = env.CORS_ORIGINS.split(',').map(o => o.trim());
  app.use(cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (curl, Postman, server-to-server)
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  }));

  // ── Parsing & compression ─────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(compression());

  // ── HTTP request logging ──────────────────────────────────────
  app.use(requestLogger);

  // ── API routes ────────────────────────────────────────────────
  app.use('/api/v1', routes);

  // ── 404 & error handlers (must be last) ──────────────────────
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
