/**
 * server.ts — Entry point. Connects to MongoDB then binds the Express app to a port.
 */

import { createApp } from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase, isDatabaseConnected } from './config/database';
import { logger } from './utils/logger';
import { ReminderService }         from './calendar/reminders/ReminderService';
import { WorkflowScheduler }       from './automation/scheduler/WorkflowScheduler';
import { WorkflowTemplateService } from './automation/templates/WorkflowTemplateService';
import { ThemeService }            from './widget/themes/ThemeService';
import { startHeartbeat }          from './dashboard/realtime/SseService';
import { MarketplaceService }      from './platform/marketplace/MarketplaceService';

async function start(): Promise<void> {
  await connectDatabase().catch(err => {
    logger.warn({ err }, 'Server starting without database connection');
  });

  // Start background jobs
  ReminderService.startCronJob();
  WorkflowScheduler.startCronJobs();
  startHeartbeat();

  // Seed system data (idempotent)
  WorkflowTemplateService.seedSystemTemplates().catch(() => {});
  ThemeService.seedSystemThemes().catch(() => {});
  MarketplaceService.seedSystemApps().catch(() => {});

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    // Structured startup log — operational context only, no secret values
    logger.info(
      {
        environment:       env.NODE_ENV,
        version:           env.API_VERSION,
        port:              env.PORT,
        database:          isDatabaseConnected() ? 'connected' : 'disconnected',
        buildTime:         process.env.BUILD_TIMESTAMP ?? 'development',
        globalRateLimit:   'enabled (200 req / 15 min)',
        mongoSanitize:     'enabled',
        helmet:            'enabled (CSP disabled)',
        corsMode:          env.isProd ? 'production (Origin required)' : 'development (Origin optional)',
      },
      'LeadFlow API started'
    );
  });

  function shutdown(signal: string): void {
    logger.info({ signal }, 'Shutdown signal received — closing gracefully');
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
