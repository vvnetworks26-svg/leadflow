/**
 * WorkflowEngine.ts
 *
 * Core execution engine. Runs a workflow step-by-step:
 *   Trigger → Conditions → Steps (actions, branches, delays) → Completion
 *
 * Supports: branching, nested conditions, loops, delays, retries,
 *           execution history, timeouts, dead-letter queue.
 *
 * All side-effects are fire-and-forget from the perspective of the caller.
 */

import { randomUUID }              from 'crypto';
import { WorkflowModel }           from '../../models/Workflow.model';
import { WorkflowExecutionModel, IExecutionStep } from '../../models/WorkflowExecution.model';
import { executeAction }           from '../actions/ActionExecutor';
import { passesConditions }        from '../conditions/ConditionEvaluator';
import { buildContext }            from '../variables/VariableResolver';
import { computeResumeAt }         from '../delays/DelayEngine';
import { WorkflowAnalyticsService }from '../analytics/WorkflowAnalyticsService';
import { logger }                  from '../../utils/logger';
import type {
  ExecutionContext, TriggerType, WorkflowStep, ExecutionStatus, DelayConfig,
} from '../types';

const DEFAULT_TIMEOUT_MS = 5 * 60_000;   // 5 minutes per execution
const MAX_STEPS          = 100;           // prevent infinite loops

// ─── Public API ───────────────────────────────────────────────────────────────

export const WorkflowEngine = {

  /**
   * Trigger all active workflows matching a trigger type for an organization.
   * Called from service layer (fire-and-forget).
   */
  trigger(
    triggerType:    TriggerType,
    organizationId: string,
    triggerData:    Record<string, unknown> = {},
    triggeredById?: string,
  ): void {
    WorkflowEngine._triggerAsync(triggerType, organizationId, triggerData, triggeredById)
      .catch(err => logger.warn({ err, triggerType }, '[WorkflowEngine] trigger error'));
  },

  async _triggerAsync(
    triggerType:    TriggerType,
    organizationId: string,
    triggerData:    Record<string, unknown>,
    triggeredById?: string,
  ): Promise<void> {
    // Find all active workflows for this trigger
    const workflows = await WorkflowModel.find({
      organizationId,
      status: 'active',
      'trigger.type': triggerType,
    }).lean();

    for (const wf of workflows) {
      // Check trigger filters
      if (wf.trigger.filters && !passesConditions(wf.trigger.filters, triggerData)) continue;

      // Create execution record
      const execId = randomUUID();
      const exec   = await WorkflowExecutionModel.create({
        organizationId,
        workflowId:   wf._id.toString(),
        workflowName: wf.name,
        version:      wf.currentVersion,
        status:       'pending',
        triggerType,
        triggerData,
        variables:    {},
        triggeredById:triggeredById ?? null,
        startedAt:    new Date(),
      });

      // Run asynchronously without blocking
      WorkflowEngine._execute(exec._id.toString(), wf as any, triggerData, triggeredById)
        .catch(err => logger.warn({ err, execId }, '[WorkflowEngine] execution error'));
    }
  },

  /**
   * Manually trigger a specific workflow (for the /execute endpoint).
   */
  async executeManual(
    organizationId: string,
    workflowId:     string,
    triggerData:    Record<string, unknown>,
    triggeredById?: string,
  ): Promise<string> {
    const wf = await WorkflowModel.findOne({ _id: workflowId, organizationId });
    if (!wf) throw new Error('Workflow not found');

    const exec = await WorkflowExecutionModel.create({
      organizationId,
      workflowId,
      workflowName: wf.name,
      version:      wf.currentVersion,
      status:       'pending',
      triggerType:  'manual',
      triggerData,
      variables:    {},
      triggeredById:triggeredById ?? null,
      startedAt:    new Date(),
    });

    const execId = exec._id.toString();
    WorkflowEngine._execute(execId, wf.toJSON() as any, triggerData, triggeredById)
      .catch(err => logger.warn({ err, execId }, '[WorkflowEngine] manual execution error'));

    return execId;
  },

  /**
   * Resume a waiting execution (called by the scheduler after delay).
   */
  async resume(executionId: string): Promise<void> {
    const exec = await WorkflowExecutionModel.findById(executionId);
    if (!exec || exec.status !== 'waiting') return;

    const wf = await WorkflowModel.findOne({
      _id:            exec.workflowId,
      organizationId: exec.organizationId,
    });
    if (!wf) return;

    await WorkflowExecutionModel.findByIdAndUpdate(executionId, {
      status:   'running',
      resumeAt: null,
    });

    WorkflowEngine._execute(executionId, wf.toJSON() as any, exec.triggerData as any, exec.triggeredById ?? undefined)
      .catch(err => logger.warn({ err, executionId }, '[WorkflowEngine] resume error'));
  },

  // ─── Core execution loop ─────────────────────────────────────────────────

  async _execute(
    executionId:    string,
    workflow:       { steps: WorkflowStep[]; variables: any[]; _id: string; organizationId: string; name: string },
    triggerData:    Record<string, unknown>,
    triggeredById?: string,
  ): Promise<void> {
    const startMs = Date.now();

    await WorkflowExecutionModel.findByIdAndUpdate(executionId, { status: 'running' });

    const ctx: ExecutionContext = {
      organizationId: workflow.organizationId,
      workflowId:     workflow._id.toString(),
      executionId,
      triggerType:    triggerData._triggerType as TriggerType ?? 'manual',
      triggerData,
      variables:      {},
      attempt:        1,
    };

    const resolvedCtx = await buildContext(ctx, workflow.variables ?? []);
    const steps        = workflow.steps as WorkflowStep[];
    const stepMap      = new Map(steps.map(s => [s.id, s]));

    // Find entry point: first step
    let currentStepId: string | null = steps[0]?.id ?? null;
    let stepCount     = 0;
    const executedSteps: IExecutionStep[] = [];

    while (currentStepId && stepCount < MAX_STEPS) {
      // Timeout check
      if (Date.now() - startMs > DEFAULT_TIMEOUT_MS) {
        await WorkflowEngine._finalize(executionId, workflow, 'timeout', 'Execution timeout exceeded', executedSteps, startMs);
        return;
      }

      const step = stepMap.get(currentStepId);
      if (!step) break;

      stepCount++;
      ctx.currentStepId = currentStepId;

      // Guard conditions check
      if (step.conditions && !passesConditions(step.conditions, resolvedCtx)) {
        // Skip this step, move to next
        currentStepId = (step.onSuccess as string | undefined) ?? null;
        continue;
      }

      // Handle delay steps
      if (step.type === 'wait' || step.type === 'delay') {
        const delayConfig = step.params as unknown as DelayConfig;
        const resumeAt    = await computeResumeAt(delayConfig, workflow.organizationId);
        await WorkflowExecutionModel.findByIdAndUpdate(executionId, {
          status:    'waiting',
          resumeAt,
          steps:     executedSteps,
        });
        // Scheduler will call resume() when resumeAt passes
        return;
      }

      // Handle branch steps
      if (step.type === 'branch') {
        const branches = (step.params.branches ?? []) as Array<{ conditions: any; nextStepId: string }>;
        let matched    = false;
        for (const branch of branches) {
          if (passesConditions(branch.conditions, resolvedCtx)) {
            currentStepId = branch.nextStepId;
            matched = true;
            break;
          }
        }
        if (!matched) currentStepId = ((step.params.defaultNextStepId as string | undefined) ?? (step.onSuccess as string | undefined)) ?? null;
        continue;
      }

      // Execute the action
      const stepStart = Date.now();
      const stepRec: IExecutionStep = {
        stepId:      step.id,
        stepName:    step.name,
        actionType:  step.type,
        status:      'running',
        startedAt:   new Date(),
        completedAt: null,
        durationMs:  null,
        input:       step.params,
        output:      {},
        error:       null,
        attempt:     1,
      };

      const result = await executeAction(step, ctx, resolvedCtx);

      stepRec.status      = result.success ? 'completed' : 'failed';
      stepRec.completedAt = new Date();
      stepRec.durationMs  = Date.now() - stepStart;
      stepRec.output      = result.output;
      stepRec.error       = result.error ?? null;

      // Merge step output into context for subsequent steps
      Object.assign(resolvedCtx, { [`step_${step.id}`]: result.output });

      executedSteps.push(stepRec);

      if (result.success) {
        currentStepId = (step.onSuccess as string | undefined) ?? null;
      } else {
        // Retry logic
        const retry = step.retryPolicy;
        if (retry && stepRec.attempt < retry.maxAttempts) {
          const delay = retry.backoffType === 'exponential'
            ? retry.delaySeconds * Math.pow(2, stepRec.attempt - 1) * 1000
            : retry.delaySeconds * 1000;
          await new Promise(r => setTimeout(r, delay));
          stepRec.attempt++;
          continue;  // retry same step
        }
        currentStepId = (step.onFailure as string | undefined) ?? null;
      }
    }

    await WorkflowEngine._finalize(executionId, workflow, 'completed', null, executedSteps, startMs);
  },

  async _finalize(
    executionId: string,
    workflow:    { _id: string; organizationId: string; name: string },
    status:      ExecutionStatus,
    error:       string | null,
    steps:       IExecutionStep[],
    startMs:     number,
  ): Promise<void> {
    const durationMs = Date.now() - startMs;
    const completedAt = new Date();

    await WorkflowExecutionModel.findByIdAndUpdate(executionId, {
      status, error, steps, completedAt, durationMs,
    });

    const isSuccess = status === 'completed';

    await WorkflowModel.findByIdAndUpdate(workflow._id, {
      $inc:  { runCount: 1, successCount: isSuccess ? 1 : 0, failureCount: isSuccess ? 0 : 1 },
      lastRunAt: completedAt,
    });

    WorkflowAnalyticsService.track({
      organizationId: workflow.organizationId,
      workflowId:     workflow._id.toString(),
      workflowName:   workflow.name,
      eventType:      isSuccess ? 'workflow_completed' : 'workflow_failed',
      durationMs,
      stepCount:      steps.length,
      error:          error ?? undefined,
    });
  },
};
