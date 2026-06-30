/**
 * requestLogger.ts — Morgan HTTP request logger wired to Pino.
 */

import morgan from 'morgan';
import { logger } from '../utils/logger';

const stream = { write: (msg: string) => logger.info(msg.trim()) };

export const requestLogger = morgan(
  ':method :url :status :res[content-length] - :response-time ms',
  { stream }
);
