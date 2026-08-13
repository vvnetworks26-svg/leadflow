/**
 * ConversationSummaryPipeline.test.ts
 *
 * Real BullMQ + real (local) Redis + real (in-memory) MongoDB integration
 * test for the async conversation-summary pipeline — no mocked dedup
 * behavior, no mocked queue. Requires a local Redis instance running at
 * REDIS_URL (defaults to redis://localhost:6379 — see .env.example / README
 * "Prerequisites" for how to start one).
 */

import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { QueueEvents } from 'bullmq';
import { createRedisConnection } from '../redisConnection';
import { CONVERSATION_SUMMARY_QUEUE_NAME, enqueueConversationSummary, closeConversationSummaryQueue } from '../ConversationSummaryQueue';
import { startConversationSummaryWorker, stopConversationSummaryWorker } from '../ConversationSummaryWorker';
import { AIConversationSessionModel } from '../../../models/AIConversationSession.model';
import { emptyMemory } from '../../types';

// BullMQ jobId dedup (by design — see ConversationSummaryQueue.ts) persists
// in Redis across separate test *runs*, not just within one. A hardcoded
// conversationId would silently no-op on a second run against the same
// Redis instance (the job already exists in the 'completed' set), so every
// ID here is suffixed with a per-run token to guarantee a clean slate.
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('Conversation summary pipeline (real Redis + real BullMQ)', () => {
  let mongod: MongoMemoryServer;

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  });

  after(async () => {
    await stopConversationSummaryWorker();
    await closeConversationSummaryQueue();
    await mongoose.disconnect();
    await mongod.stop();
  });

  async function seedSession(conversationId: string, organizationId: string) {
    const memory = emptyMemory();
    memory.visitorName = 'Jordan Rivera';
    memory.industry = 'HVAC';
    memory.painPoints = ['AC not cooling'];
    memory.bookingStatus = 'requested';

    await AIConversationSessionModel.create({
      organizationId,
      conversationId,
      stage: 'completed',
      memory,
      history: [],
      qualification: null,
      turnCount: 3,
      lastActivity: new Date(),
    });
  }

  it('a job enqueued once processes and persists memory.summary correctly', async () => {
    const conversationId = `convo-single-run-${RUN_ID}`;
    const organizationId = 'org-single-run';
    await seedSession(conversationId, organizationId);

    const worker = startConversationSummaryWorker();
    const completed = new Promise<void>((resolve) => {
      worker.on('completed', (job) => {
        if (job.id === conversationId) resolve();
      });
    });

    await enqueueConversationSummary(conversationId, organizationId);
    await completed;

    const session = await AIConversationSessionModel
      .findOne({ conversationId, organizationId })
      .lean();
    assert.ok(session, 'session should still exist');
    const summary = (session!.memory as any).summary as string | undefined;
    assert.ok(summary, 'memory.summary should be populated');
    assert.match(summary!, /Jordan Rivera/);
    assert.match(summary!, /AC not cooling/);
  });

  it('two trigger points firing in quick succession for the same session compute the summary once, not twice (real BullMQ jobId dedup, not mocked)', async () => {
    const conversationId = `convo-dedup-${RUN_ID}`;
    const organizationId = 'org-dedup';
    await seedSession(conversationId, organizationId);

    const worker = startConversationSummaryWorker();
    const completedJobIds: string[] = [];
    worker.on('completed', (job) => {
      if (job.id === conversationId) completedJobIds.push(job.id);
    });

    // Also listen at the queue-events level for BullMQ's own 'duplicated'
    // event — direct proof of the dedup mechanism itself, not an inference.
    const queueEventsConnection = createRedisConnection();
    const queueEvents = new QueueEvents(CONVERSATION_SUMMARY_QUEUE_NAME, { connection: queueEventsConnection });
    try {
      await queueEvents.waitUntilReady();
      // waitUntilReady() resolves once the connection is up, but the
      // internal XREAD stream-consumer loop needs a moment to actually
      // start listening — without this, the 'duplicated' event (fired
      // synchronously inside the second .add()'s Lua script, milliseconds
      // later) can be emitted before this reader is positioned to catch it.
      await new Promise((r) => setTimeout(r, 200));

      let duplicatedFired = false;
      queueEvents.on('duplicated', ({ jobId }) => {
        if (jobId === conversationId) duplicatedFired = true;
      });

      // Fire two trigger points for the same session back-to-back, before
      // the first job has necessarily finished processing. Sequenced (not
      // Promise.all) so the second call's Lua script deterministically runs
      // after the first job's hash already exists in Redis.
      await enqueueConversationSummary(conversationId, organizationId);
      await enqueueConversationSummary(conversationId, organizationId);

      // Wait for the (single) completion, then give the duplicated event a
      // moment to arrive (it's a separate Redis stream read).
      await new Promise<void>((resolve) => {
        const check = () => { if (completedJobIds.length > 0) resolve(); };
        worker.on('completed', check);
        check();
      });
      await new Promise((r) => setTimeout(r, 800));

      assert.equal(completedJobIds.length, 1, 'the processor must have run exactly once, not twice');
      assert.equal(duplicatedFired, true, "BullMQ's own duplicated event should have fired for the second enqueue");
    } finally {
      // Same connection-release issue as Queue/Worker.close() (see
      // ConversationSummaryQueue.ts's comment) — close() alone doesn't
      // release the underlying ioredis connection. In try/finally so a
      // failed assertion above still leaves this closed.
      await queueEvents.close();
      await queueEventsConnection.quit();
    }
  });

  it('worker failure retries per the configured attempts policy and never crashes the process', async () => {
    const conversationId = `convo-retry-${RUN_ID}`;
    const organizationId = 'org-retry';
    await seedSession(conversationId, organizationId);

    const worker = startConversationSummaryWorker();

    let callCount = 0;
    const originalFindOne = AIConversationSessionModel.findOne.bind(AIConversationSessionModel);
    const findOneMock = mock.method(AIConversationSessionModel, 'findOne', function (this: unknown, ...args: any[]) {
      callCount++;
      if (callCount === 1) {
        // Force the first attempt to fail, simulating a transient error.
        return { lean: () => Promise.reject(new Error('simulated transient DB error')) } as any;
      }
      return (originalFindOne as any)(...args);
    });

    try {
      const failedEvents: string[] = [];
      const completed = new Promise<any>((resolve) => {
        worker.on('failed', (job) => { if (job?.id === conversationId) failedEvents.push('failed'); });
        worker.on('completed', (job) => { if (job.id === conversationId) resolve(job); });
      });

      await enqueueConversationSummary(conversationId, organizationId);
      const finishedJob = await completed;

      // The process is still alive and able to run this assertion at all —
      // that alone is proof a thrown processor error didn't crash it.
      assert.equal(failedEvents.length, 1, 'the first (forced) attempt should have emitted a failed event');
      assert.ok(finishedJob.attemptsMade >= 2, 'the job should have retried after the simulated failure');

      const session = await AIConversationSessionModel.findOne({ conversationId, organizationId }).lean();
      assert.ok((session!.memory as any).summary, 'summary should be populated after the retry succeeded');
    } finally {
      findOneMock.mock.restore();
    }
  });

  it('graceful shutdown waits for an in-flight job instead of dropping it', async () => {
    const conversationId = `convo-shutdown-${RUN_ID}`;
    const organizationId = 'org-shutdown';
    await seedSession(conversationId, organizationId);

    // Start a fresh worker for this test (the module-level singleton was
    // stopped by the previous assertions' cleanup path if any ran close()).
    const worker = startConversationSummaryWorker();

    const originalUpdate = AIConversationSessionModel.findByIdAndUpdate.bind(AIConversationSessionModel);
    const updateMock = mock.method(AIConversationSessionModel, 'findByIdAndUpdate', async function (this: unknown, ...args: any[]) {
      // Artificial delay so there's a real window where the job is
      // "in-flight" when stopConversationSummaryWorker() is called below.
      await new Promise((r) => setTimeout(r, 500));
      return (originalUpdate as any)(...args);
    });

    try {
      const active = new Promise<void>((resolve) => {
        worker.on('active', (job) => { if (job.id === conversationId) resolve(); });
      });

      await enqueueConversationSummary(conversationId, organizationId);
      await active; // job has started processing — now genuinely in-flight

      const shutdownStarted = Date.now();
      await stopConversationSummaryWorker(); // should wait, not hang or drop
      const shutdownMs = Date.now() - shutdownStarted;

      assert.ok(shutdownMs < 5000, `shutdown should not hang indefinitely (took ${shutdownMs}ms)`);
      assert.ok(shutdownMs >= 400, 'shutdown should have waited for the in-flight job\'s artificial delay, not dropped it immediately');

      const session = await AIConversationSessionModel.findOne({ conversationId, organizationId }).lean();
      assert.ok((session!.memory as any).summary, 'the in-flight job must have completed, not been silently dropped by shutdown');
    } finally {
      updateMock.mock.restore();
    }
  });
});
