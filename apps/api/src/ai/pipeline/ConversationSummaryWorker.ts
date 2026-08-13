/**
 * ai/pipeline/ConversationSummaryWorker.ts
 *
 * In-process BullMQ worker — same pattern as ReminderService.startCronJob()
 * and WorkflowScheduler.startCronJobs() in server.ts (no separate Render
 * worker service; this runs on the same dyno as the API).
 *
 * Computes and persists AIConversationSession.memory.summary, moved off
 * the synchronous path in ai/orchestrator.ts. qualifyLead() itself is NOT
 * touched — it stays synchronous and per-turn; this worker only reuses its
 * *result* (session.qualification, already computed live) as an input to
 * buildSummary(), recomputing only if that stored value is somehow absent.
 */

import { Worker, Job } from 'bullmq';
import type IORedis from 'ioredis';
import { createRedisConnection } from './redisConnection';
import { CONVERSATION_SUMMARY_QUEUE_NAME, type ConversationSummaryJobData } from './ConversationSummaryQueue';
import { AIConversationSessionModel } from '../../models/AIConversationSession.model';
import { qualifyLead } from '../qualification';
import { generateRecommendations } from '../recommendation';
import { buildSummary } from '../summarizer';
import { emptyMemory } from '../types';
import { logger } from '../../utils/logger';

let _worker: Worker<ConversationSummaryJobData> | null = null;
let _connection: IORedis | null = null;

async function processConversationSummaryJob(job: Job<ConversationSummaryJobData>): Promise<void> {
  const { conversationId, organizationId } = job.data;

  const session = await AIConversationSessionModel
    .findOne({ conversationId, organizationId })
    .lean();

  if (!session) {
    // Not an error — the session may have raced with something else, or
    // this is a stale job left over from a prior test/deploy. Nothing to
    // summarize.
    logger.warn({ conversationId, organizationId }, '[ConversationSummaryWorker] Session not found — skipping');
    return;
  }

  const memory          = (session.memory as any) ?? emptyMemory();
  const qualification    = session.qualification ?? qualifyLead(memory);
  const recommendations  = generateRecommendations(memory, qualification, 3);
  const summary          = buildSummary(memory, qualification, recommendations);

  await AIConversationSessionModel.findByIdAndUpdate(session._id, {
    $set: { 'memory.summary': summary.fullSummary },
  });
}

/**
 * Start the worker. Idempotent — calling this more than once (e.g. in
 * tests) returns the existing worker rather than creating a second one.
 */
export function startConversationSummaryWorker(): Worker<ConversationSummaryJobData> {
  if (_worker) return _worker;

  _connection = createRedisConnection();
  _worker = new Worker<ConversationSummaryJobData>(
    CONVERSATION_SUMMARY_QUEUE_NAME,
    processConversationSummaryJob,
    { connection: _connection, concurrency: 5 },
  );

  // A thrown processor error can never crash the host process — BullMQ's
  // Worker.processJob() wraps callProcessJob() in its own try/catch and
  // routes failures to handleFailed() (confirmed directly from
  // classes/worker.js, not assumed). This 'failed' listener is for
  // visibility only, not safety.
  _worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id, attemptsMade: job?.attemptsMade }, '[ConversationSummaryWorker] Job failed');
  });

  // Node's EventEmitter throws synchronously if an 'error' event has zero
  // listeners — this listener exists to prevent that, for connection/
  // infrastructure-level errors distinct from per-job failures above.
  _worker.on('error', (err) => {
    logger.error({ err }, '[ConversationSummaryWorker] Worker-level error');
  });

  logger.info('[ConversationSummaryWorker] Started');
  return _worker;
}

/**
 * Stop the worker gracefully. worker.close() (force=false, the default)
 * waits for any in-flight job to finish before closing — confirmed
 * directly from BullMQ's Worker.close() source, not assumed. Call this
 * before closing the Mongo connection during shutdown.
 *
 * worker.close() alone does NOT release the underlying ioredis connection
 * (confirmed empirically — same issue as ConversationSummaryQueue's
 * close(), see that file's comment) — the explicit connection.quit()
 * below is required, not defensive extra code.
 */
export async function stopConversationSummaryWorker(): Promise<void> {
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
  if (_connection) {
    await _connection.quit();
    _connection = null;
  }
}
