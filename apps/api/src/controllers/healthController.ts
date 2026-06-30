import { Request, Response } from 'express';
import { env } from '../config/env';
import { isDatabaseConnected } from '../config/database';

export function getHealth(_req: Request, res: Response): void {
  res.status(200).json({
    status: 'ok',
    version: env.API_VERSION,
    environment: env.NODE_ENV,
    database: isDatabaseConnected() ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
}
