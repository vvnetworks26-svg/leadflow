/**
 * WorkflowScheduler.ts
 *
 * Background scheduler running on node-cron.
 * Responsibilities:
 *   1. Resume 'waiting' executions whose resumeAt has passed
 *   2. Retry 'retrying' executions whose nextRetryAt has passed
 *   3. Timeout 'running' executions stuck > timeout threshold
 *   4. Fire 'schedule'-triggered workflows (cron expressions)
 *   5. Move dead executions to failed (dead-letter queue)
 */

import cron                         from 'node-cron';
import { WorkflowExecutionModel }   from '../../models/WorkflowExecution.model';
import { WorkflowModel }            from '../../models/Workflow.model';
import { WorkflowEngine }           from '../engine/WorkflowEngine';
import { logger }                   from '../../utils/logger';

const STUCK_THRESHOLD_MS   = 10 * 60_000;  // 10 minutes
const MAX_RETRY_ATTEMPTS    = 3;
const RETRY_BACKOFF_SECONDS = 60;

export const WorkflowScheduler = {

  startCronJobs(): void {
    // Every minute: resume delayed workflows + retry failures + timeout stuck
    cron.schedule('* * * * *', async () => {
      await WorkflowScheduler._resumeWaiting();
      await WorkflowScheduler._retryFailed();
      await WorkflowScheduler._timeoutStuck();
    });

    // Every minute: fire scheduled workflows
    cron.schedule('* * * * *', async () => {
      await WorkflowScheduler._fireScheduledWorkflows();
    });

    logger.info('[WorkflowScheduler] Cron jobs started');
  },

  async _resumeWaiting(): Promise<void> {
    const now      = new Date();
    const executions = await WorkflowExecutionModel.find({
      status:   'waiting',
      resumeAt: { $lte: now },
    }).limit(50).lean();

    for (const exec of executions) {
      WorkflowEngine.resume(exec._id.toString())
        .catch(err => logger.warn({ err, execId: exec._id }, '[Scheduler] resume failed'));
    }
  },

  async _retryFailed(): Promise<void> {
    const now        = new Date();
    const executions = await WorkflowExecutionModel.find({
      status:      'retrying',
      nextRetryAt: { $lte: now },
      attempt:     { $lt: MAX_RETRY_ATTEMPTS },
    }).limit(20).lean();

    for (const exec of executions) {
      await WorkflowExecutionModel.findByIdAndUpdate(exec._id, {
        status:      'pending',
        nextRetryAt: null,
        attempt:     exec.attempt + 1,
      });
      WorkflowEngine.resume(exec._id.toString())
        .catch(err => logger.warn({ err }, '[Scheduler] retry failed'));
    }
  },

  async _timeoutStuck(): Promise<void> {
    const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS);
    await WorkflowExecutionModel.updateMany(
      { status: 'running', startedAt: { $lt: cutoff } },
      { status: 'timeout', error: 'Execution timed out', completedAt: new Date() }
    );
  },

  async _fireScheduledWorkflows(): Promise<void> {
    // Find active workflows with 'schedule' trigger
    const workflows = await WorkflowModel.find({
      status:         'active',
      'trigger.type': 'schedule',
    }).lean();

    const now  = new Date();
    const hhmm = `${String(now.getUTCHours()).padStart(2,'0')}:${String(now.getUTCMinutes()).padStart(2,'0')}`;

    for (const wf of workflows) {
      const schedule = wf.trigger.schedule;
      if (!schedule) continue;

      // Simple cron matching for common patterns
      if (matchesCron(schedule, now)) {
        WorkflowEngine.trigger('schedule', wf.organizationId, { scheduledAt: now.toISOString() });
      }
    }
  },

  /** Mark an execution as retrying with next retry timestamp. */
  async scheduleRetry(executionId: string, attempt: number): Promise<void> {
    const delaySec = RETRY_BACKOFF_SECONDS * Math.pow(2, attempt - 1);
    await WorkflowExecutionModel.findByIdAndUpdate(executionId, {
      status:      'retrying',
      nextRetryAt: new Date(Date.now() + delaySec * 1000),
    });
  },

  /** Move stuck executions to dead-letter (failed + error message). */
  async deadLetter(executionId: string, reason: string): Promise<void> {
    await WorkflowExecutionModel.findByIdAndUpdate(executionId, {
      status:      'failed',
      error:       `Dead-letter: ${reason}`,
      completedAt: new Date(),
    });
  },
};

// ─── Simple cron expression matcher ──────────────────────────────────────────

function matchesCron(expression: string, date: Date): boolean {
  try {
    // Only validate — actual matching relies on node-cron's own scheduler
    // For scheduled workflows stored in DB we do a lightweight check
    const parts = expression.trim().split(/\s+/);
    if (parts.length < 5) return false;
    const [min, hour, dom, month, dow] = parts;
    return (
      matchField(min,   date.getUTCMinutes()) &&
      matchField(hour,  date.getUTCHours())   &&
      matchField(dom,   date.getUTCDate())     &&
      matchField(month, date.getUTCMonth() + 1) &&
      matchField(dow,   date.getUTCDay())
    );
  } catch {
    return false;
  }
}

function matchField(field: string, value: number): boolean {
  if (field === '*') return true;
  if (field.includes('/')) {
    const [, step] = field.split('/');
    return value % parseInt(step, 10) === 0;
  }
  if (field.includes(',')) return field.split(',').map(Number).includes(value);
  return parseInt(field, 10) === value;
}
