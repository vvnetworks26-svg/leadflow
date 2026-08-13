/**
 * server.ts — Entry point. Connects to MongoDB then binds the Express app to a port.
 */

import { createApp } from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase, isDatabaseConnected } from './config/database';
import { checkGeminiHealth, handleGeminiHealthFailure } from './ai/gemini';
import { logger } from './utils/logger';
import { ReminderService }         from './calendar/reminders/ReminderService';
import { WorkflowScheduler }       from './automation/scheduler/WorkflowScheduler';
import { WorkflowTemplateService } from './automation/templates/WorkflowTemplateService';
import { ThemeService }            from './widget/themes/ThemeService';
import { startHeartbeat }          from './dashboard/realtime/SseService';
import { MarketplaceService }      from './platform/marketplace/MarketplaceService';
import { startConversationSummaryWorker, stopConversationSummaryWorker } from './ai/pipeline/ConversationSummaryWorker';
import { closeConversationSummaryQueue } from './ai/pipeline/ConversationSummaryQueue';

async function start(): Promise<void> {
  await connectDatabase().catch(err => {
    logger.warn({ err }, 'Server starting without database connection');
  });

  // Environment-aware: non-fatal in production, fails the boot everywhere
  // else. See handleGeminiHealthFailure() in ai/gemini.ts for the policy
  // and why it deliberately inverts requireInProd()'s usual polarity.
  await checkGeminiHealth().catch(err => handleGeminiHealthFailure(err, env.isProd));

  // Start background jobs
  ReminderService.startCronJob();
  WorkflowScheduler.startCronJobs();
  startHeartbeat();

  // In-process BullMQ worker (same pattern as the cron jobs above — no
  // separate Render worker service). Non-fatal if Redis is unreachable
  // (e.g. a malformed REDIS_URL) — the API still serves chat/booking
  // traffic, conversation summaries just won't be generated until this is
  // fixed. Matches connectDatabase()'s non-fatal-with-warning policy above,
  // not the Gemini health check's environment-aware fail-fast policy —
  // there's no equivalent "must not silently degrade" requirement for this
  // subsystem.
  try {
    startConversationSummaryWorker();
  } catch (err) {
    logger.warn({ err }, 'Server starting without the conversation-summary worker');
  }

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
      // worker.close() (default force=false) waits for any in-flight job to
      // finish before closing — confirmed directly from BullMQ's source, not
      // assumed. Must happen before disconnectDatabase() so an in-flight
      // job's Mongo write isn't cut off mid-shutdown.
      await stopConversationSummaryWorker().catch(err => {
        logger.warn({ err }, 'Error stopping conversation-summary worker during shutdown');
      });
      await closeConversationSummaryQueue().catch(err => {
        logger.warn({ err }, 'Error closing conversation-summary queue during shutdown');
      });
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

start().catch(err => {
  logger.error({ err }, 'Fatal error during server startup — exiting');
  process.exit(1);
});
