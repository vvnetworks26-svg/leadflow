/**
 * server.ts — Entry point. Connects to MongoDB then binds the Express app to a port.
 */

import { createApp } from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import { logger } from './utils/logger';

async function start(): Promise<void> {
  // Attempt DB connection — server starts regardless (MONGODB_URI may be empty in dev)
  await connectDatabase().catch(err => {
    logger.warn({ err }, 'Server starting without database connection');
  });

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info(`LeadFlow API  v${env.API_VERSION}  [${env.NODE_ENV}]`);
    logger.info(`Listening on http://localhost:${env.PORT}`);
    logger.info(`Health check  http://localhost:${env.PORT}/api/v1/health`);
  });

  function shutdown(signal: string): void {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      await disconnectDatabase();
      logger.info('Server closed');
      process.exit(0);
    });
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
    process.exit(1);
  });
}

start();
