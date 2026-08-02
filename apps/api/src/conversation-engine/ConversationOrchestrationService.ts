/**
 * conversation-engine/ConversationOrchestrationService.ts
 *
 * Layer 3 — Conversation Orchestration Engine.
 * The ONLY entry point the Conversation Engine calls is orchestrate().
 *
 * This service:
 *   - Never generates language
 *   - Never calls Gemini
 *   - Never mutates memory (reads only)
 *   - Produces a deterministic ConversationPlan every turn
 *
 * Pipeline per orchestrate() call:
 *   1. Load blueprint (cache → repo)
 *   2. Evaluate business rules (highest priority overrides)
 *   3. Evaluate workflow state
 *   4. Detect recovery signal (topic change, correction, etc.)
 *   5. Select next objective
 *   6. Build ConversationPlan
 */

import { loadBlueprint }          from './modules/blueprint-loader';
import { evaluateRules }          from './modules/rule-engine';
import { evaluateState }          from './modules/state-evaluator';
import { selectObjective }        from './modules/objective-selector';
import { detectRecoverySignal }   from './modules/recovery-manager';
import { buildConversationPlan }  from './modules/conversation-plan-builder';
import { InMemoryBlueprintRepository } from './repository/InMemoryBlueprintRepository';
import { blueprintCache }         from './cache/BlueprintCache';
import { logger }                 from '../utils/logger';
import type { IBlueprintRepository }  from './repository/BlueprintRepository';
import type {
  OrchestrationInput, OrchestrationResult,
  ConversationPlan, ConversationObjective, WorkflowState,
} from './types';

// ─── Repository singleton ─────────────────────────────────────────────────────

let _repo: IBlueprintRepository = new InMemoryBlueprintRepository();

export function setBlueprintRepository(repo: IBlueprintRepository): void {
  _repo = repo;
  blueprintCache.clear();
}

// ─── Safe fallback plan ───────────────────────────────────────────────────────

function fallbackPlan(): OrchestrationResult {
  const plan = buildConversationPlan({
    objective:    'build_rapport',
    workflowState:'initialising',
    blueprint:    null,
    ruleApplied:  null,
    reason:       'Orchestration failed — safe fallback to greeting',
  });
  return {
    plan,
    updatedWorkflowState: 'initialising',
    updatedObjective:     'build_rapport',
    blueprintId:          null,
  };
}

// ─── Public service ───────────────────────────────────────────────────────────

export const ConversationOrchestrationService = {

  /**
   * Primary entry point. Produces a ConversationPlan every turn.
   * Never throws — returns a safe fallback on any error.
   */
  async orchestrate(input: OrchestrationInput): Promise<OrchestrationResult> {
    try {
      // ── 1. Load blueprint ─────────────────────────────────────────────────
      const blueprint = await loadBlueprint(
        _repo,
        input.intent.blueprintId ?? input.currentBlueprintId,
        input.identity.companyProfile.industry,
        input.intent.category,
      );

      // ── 2. Evaluate business rules ────────────────────────────────────────
      const ruleResult = evaluateRules({
        memory:       input.memory,
        urgency:      input.intent.urgency,
        intent:       input.intent.category,
        requiresHuman:input.intent.requiresHuman,
        businessHours:input.identity.businessHours,
        timezone:     input.identity.contactInfo.timezone,
        rules:        blueprint?.rules ?? [],
      });

      // Rule fires → short-circuit to rule-mandated objective
      if (ruleResult.fired && ruleResult.targetObjective) {
        const state   = ruleResult.targetState ?? 'escalating';
        const plan    = buildConversationPlan({
          objective:    ruleResult.targetObjective,
          workflowState:state,
          blueprint,
          ruleApplied:  ruleResult.ruleId,
          reason:       ruleResult.reason,
        });
        return { plan, updatedWorkflowState: state, updatedObjective: ruleResult.targetObjective, blueprintId: blueprint?.id ?? null };
      }

      // ── 3. Evaluate workflow state ────────────────────────────────────────
      const workflowState = evaluateState({
        memory:           input.memory,
        blueprint,
        urgency:          input.intent.urgency,
        currentObjective: input.currentObjective,
        requiresHuman:    input.intent.requiresHuman,
        turnCount:        input.turnCount,
      });

      // ── 4. Detect recovery signal ─────────────────────────────────────────
      const lastMessage = input.history.length > 0
        ? input.history[input.history.length - 1].content
        : '';

      // Only run recovery on user turns
      const lastRole = input.history.length > 0
        ? input.history[input.history.length - 1].role
        : 'assistant';

      const defaultRecovery = blueprint?.stages[0]?.recoveryStrategy ?? {
        onAmbiguity: 'clarify_intent' as ConversationObjective,
        onRepeat: 'clarify_intent' as ConversationObjective,
        onContradiction: 'clarify_intent' as ConversationObjective,
        onTopicChange: 'build_rapport' as ConversationObjective,
        preserveContext: true,
      };

      let recoveredObjective: ConversationObjective | null = null;
      let recoveryReason = '';

      if (lastRole === 'user' && input.currentObjective) {
        const rec = detectRecoverySignal({
          message:          lastMessage,
          intent:           input.intent.category,
          currentObjective: input.currentObjective,
          memory:           input.memory,
          strategy:         defaultRecovery,
          turnCount:        input.turnCount,
        });
        if (rec.signal !== 'none') {
          recoveredObjective = rec.newObjective;
          recoveryReason     = rec.reason;
        }
      }

      // ── 5. Select objective ───────────────────────────────────────────────
      let objective: ConversationObjective;

      if (recoveredObjective) {
        objective = recoveredObjective;
      } else if (blueprint) {
        objective = selectObjective({
          blueprint,
          progress:        input.progress,
          workflowState,
          intentCategory:  input.intent.category,
          currentObjective:input.currentObjective,
          bookingConfirmed:input.memory.bookingStatus === 'booked',
        });
      } else {
        objective = input.currentObjective ?? 'build_rapport';
      }

      // ── 6. Build plan ─────────────────────────────────────────────────────
      const plan = buildConversationPlan({
        objective,
        workflowState,
        blueprint,
        ruleApplied: null,
        reason: recoveryReason || buildReason(objective, workflowState, input.turnCount),
      });

      return {
        plan,
        updatedWorkflowState: workflowState,
        updatedObjective:     objective,
        blueprintId:          blueprint?.id ?? null,
      };
    } catch (err) {
      logger.error({ err, conversationId: input.conversationId }, '[ConversationOrchestration] orchestrate() failed');
      return fallbackPlan();
    }
  },

  /** Load a blueprint by id + industry + intent (exposed for testing) */
  async loadBlueprint(id: string | null, industry: string, intent: string) {
    return loadBlueprint(_repo, id, industry, intent);
  },

  /** Evaluate state without running the full pipeline */
  evaluateState(input: Parameters<typeof evaluateState>[0]) {
    return evaluateState(input);
  },

  /** Select objective without running the full pipeline */
  selectObjective(input: Parameters<typeof selectObjective>[0]) {
    return selectObjective(input);
  },

  /** Build plan without running the full pipeline */
  buildConversationPlan(input: Parameters<typeof buildConversationPlan>[0]): ConversationPlan {
    return buildConversationPlan(input);
  },

  invalidateBlueprintCache(id?: string): void {
    if (id) blueprintCache.invalidate(id);
    else    blueprintCache.clear();
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildReason(
  objective:    ConversationObjective,
  state:        WorkflowState,
  turnCount:    number,
): string {
  return `Turn ${turnCount}: objective=${objective}, state=${state}`;
}
