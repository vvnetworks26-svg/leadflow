/**
 * readyController.ts
 *
 * Readiness probe — the endpoint Render's health check points at.
 *
 * Deliberately distinct from getHealth() (healthController.ts). getHealth()
 * ALWAYS returns 200 and reports database state only in its body, which makes
 * it useless as a platform health check: an instance with a dead Mongo
 * connection still looks healthy and keeps receiving traffic. That handler is
 * left exactly as-is — something may already depend on its shape — and this
 * one is added alongside it.
 *
 * Reuses isDatabaseConnected() from config/database.ts rather than reading
 * mongoose.connection.readyState again here, so there is exactly one
 * definition of "connected" in the codebase.
 */

import { Request, Response } from 'express';
import { isDatabaseConnected } from '../config/database';

export function getReady(_req: Request, res: Response): void {
  const connected = isDatabaseConnected();

  res.status(connected ? 200 : 503).json({
    ready:     connected,
    database:  connected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
}
