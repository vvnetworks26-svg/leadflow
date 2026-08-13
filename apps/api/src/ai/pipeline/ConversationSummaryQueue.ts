/**
 * ai/pipeline/ConversationSummaryQueue.ts
 *
 * BullMQ queue for the async post-conversation summary pipeline.
 * buildSummary() (ai/summarizer.ts) is deterministic and non-LLM — no
 * external API call, purely local computation from already-persisted
 * session data. That's why the dedup + retry policy below is safe:
 *
 *   - jobId = conversationId. BullMQ treats re-adding a job with an
 *     existing jobId as a no-op ("duplicated" — confirmed directly from
 *     BullMQ's addStandardJob Lua script: it checks `EXISTS <jobId key>`
 *     and short-circuits without re-running the processor) for as long as
 *     that job's Redis hash still exists — i.e. while queued, active, or
 *     completed-but-not-yet-cleaned-up. This collapses multiple trigger
 *     points firing for the same session into a single actual run.
 *   - removeOnComplete below bounds how long that dedup window lasts.
 *     Once a completed job is cleaned up, its jobId key no longer exists,
 *     so a later trigger for the same session is treated as a genuinely
 *     new job and recomputes. That's intentional and harmless — the
 *     recompute is cheap/local/idempotent, so this is a feature (a stale
 *     summary can be regenerated), not a bug to guard against further.
 *   - attempts + backoff: BullMQ's default is `attempts: 0` (effectively
 *     one try, no retry) — confirmed from Job's default options, not left
 *     unconfigured. The only real failure points in the processor are the
 *     Mongo read/write around the (pure, in-memory) summary computation,
 *     so a small retry budget is worth it.
 */

import { Queue } from 'bullmq';
import type IORedis from 'ioredis';
import { createRedisConnection } from './redisConnection';

export const CONVERSATION_SUMMARY_QUEUE_NAME = 'conversation-summary';

export interface ConversationSummaryJobData {
  conversationId: string;
  organizationId: string;
}

let _queue: Queue<ConversationSummaryJobData> | null = null;
let _connection: IORedis | null = null;

function getQueue(): Queue<ConversationSummaryJobData> {
  if (!_queue) {
    _connection = createRedisConnection();
    _queue = new Queue<ConversationSummaryJobData>(CONVERSATION_SUMMARY_QUEUE_NAME, {
      connection: _connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        // Bounds the jobId-dedup window (see module doc above) and keeps
        // Redis from growing unbounded. Failed jobs are kept longer for
        // debugging since they're rarer and cheaper to retain.
        removeOnComplete: { age: 24 * 3600, count: 1000 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    });
  }
  return _queue;
}

/**
 * Enqueue a conversation-summary job for the given session. Safe to call
 * from multiple trigger points for the same session — see dedup notes
 * above. Never throws to the caller by design of how it's used (callers
 * wrap this in their own non-fatal .catch(); this function itself does
 * not swallow errors so callers can decide how to log them).
 */
export async function enqueueConversationSummary(
  conversationId: string,
  organizationId: string,
): Promise<void> {
  await getQueue().add(
    'summarize',
    { conversationId, organizationId },
    { jobId: conversationId },
  );
}

/**
 * Close the queue and its Redis connection. Call once, on process shutdown
 * (or test teardown).
 *
 * queue.close() alone does NOT release the underlying ioredis connection —
 * confirmed empirically (a minimal repro script hung indefinitely after
 * `await queue.close()` until the connection itself was explicitly
 * quit — BullMQ's own close() resolves without fully releasing it). The
 * explicit connection.quit() below is required, not defensive extra code.
 */
export async function closeConversationSummaryQueue(): Promise<void> {
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
  if (_connection) {
    await _connection.quit();
    _connection = null;
  }
}
