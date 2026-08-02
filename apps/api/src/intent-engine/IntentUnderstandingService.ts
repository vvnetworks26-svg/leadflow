/**
 * intent-engine/IntentUnderstandingService.ts
 *
 * Layer 2 — Intent Understanding Engine.
 * Single public entry point for the Conversation Engine.
 *
 * Flow per analyze() call:
 *   1. Load rules + mappings (cache → repository)
 *   2. Classify message → ranked IntentCandidates
 *   3. Resolve ambiguity → select primary intent
 *   4. Evaluate confidence level
 *   5. Analyze urgency independently
 *   6. Extract entities
 *   7. Select blueprint
 *   8. Build immutable ResolvedIntent
 *
 * Never throws — returns unknown-intent result on any failure so the
 * Conversation Engine can always continue.
 */

import { intentRulesCache }      from './cache/IntentRulesCache';
import { InMemoryIntentRepository } from './repository/InMemoryIntentRepository';
import { classifyMessage }        from './modules/intent-classifier';
import { resolveIntent }          from './modules/ambiguity-resolver';
import { toConfidenceLevel, isCertain, shouldEscalate } from './modules/confidence-evaluator';
import { analyzeUrgency, urgencySignals } from './modules/urgency-analyzer';
import { extractEntities }        from './modules/entity-extractor';
import { selectBlueprint }        from './modules/blueprint-selector';
import { buildResolvedIntent }    from './IntentFactory';
import { logger }                 from '../utils/logger';
import type { IIntentRepository } from './repository/IntentRepository';
import type {
  IntentAnalysisInput,
  IntentAnalysisResult,
  ResolvedIntent,
  IntentCandidate,
} from './types';

// ─── Repository singleton (swappable for tests) ───────────────────────────────

let _repository: IIntentRepository = new InMemoryIntentRepository();

export function setIntentRepository(repo: IIntentRepository): void {
  _repository = repo;
  intentRulesCache.invalidate();
}

// ─── Unknown-intent fallback ──────────────────────────────────────────────────

function unknownResult(rawMessage: string): IntentAnalysisResult {
  const intent = buildResolvedIntent({
    category:              'unknown',
    subCategory:           '',
    score:                 0,
    urgency:               'normal',
    detectedService:       null,
    entities:              [],
    candidates:            [],
    reasoning:             'No intent signals detected.',
    blueprintId:           null,
    requiresHuman:         false,
    requiresClarification: false,
    rawMessage,
  });
  return { intent, clarificationQuestion: null };
}

// ─── Load rules (cache → repo) ────────────────────────────────────────────────

async function loadRules() {
  const cached = intentRulesCache.get();
  if (cached) return cached;

  const [rules, mappings] = await Promise.all([
    _repository.getRules(),
    _repository.getMappings(),
  ]);
  intentRulesCache.set(rules, mappings);
  return { rules, mappings };
}

// ─── Public service ───────────────────────────────────────────────────────────

export const IntentUnderstandingService = {

  /**
   * Primary entry point for the Conversation Engine.
   * Analyzes a customer message and returns a fully resolved intent.
   * Never throws.
   */
  async analyze(input: IntentAnalysisInput): Promise<IntentAnalysisResult> {
    try {
      const { rules, mappings } = await loadRules();

      // ── 1. Classify ───────────────────────────────────────────────────────
      const candidates = classifyMessage(input.message, rules);

      // ── 2. Resolve ambiguity ──────────────────────────────────────────────
      const resolution = resolveIntent(candidates);
      const primary    = resolution.primary;

      // ── 3. Confidence level ───────────────────────────────────────────────
      const confidenceLevel = toConfidenceLevel(primary.score);

      // ── 4. Urgency ────────────────────────────────────────────────────────
      const urgency      = analyzeUrgency(input.message);
      const uSignals     = urgencySignals(input.message);

      // Urgency upgrade: emergency intent always at least 'emergency'
      const effectiveUrgency = (
        primary.category === 'emergency_service' && urgency === 'normal'
      ) ? 'emergency' : urgency;

      // ── 5. Entities ───────────────────────────────────────────────────────
      const entities = extractEntities(input.message, input.availableServices);

      // ── 6. Detected service (from entities or service catalog match) ──────
      const detectedService = resolveDetectedService(entities, input.availableServices);

      // ── 7. Blueprint selection ────────────────────────────────────────────
      const blueprintId = selectBlueprint(mappings, input.industry, primary.category);

      // ── 8. Derived flags ──────────────────────────────────────────────────
      const requiresHuman = shouldEscalate(primary.category, confidenceLevel) ||
                            effectiveUrgency === 'critical';

      // ── 9. Reasoning string (for explainability / debugging) ──────────────
      const reasoning = buildReasoning(primary, candidates, effectiveUrgency, uSignals, blueprintId);

      // ── 10. Build immutable aggregate ─────────────────────────────────────
      const intent = buildResolvedIntent({
        category:              primary.category,
        subCategory:           primary.subCategory,
        score:                 primary.score,
        urgency:               effectiveUrgency,
        detectedService,
        entities,
        candidates,
        reasoning,
        blueprintId,
        requiresHuman,
        requiresClarification: resolution.requiresClarification && !requiresHuman,
        rawMessage:            input.message,
      });

      return {
        intent,
        clarificationQuestion: resolution.requiresClarification && !requiresHuman
          ? resolution.clarificationQuestion
          : null,
      };
    } catch (err) {
      logger.error({ err, message: input.message }, '[IntentUnderstandingService] Analysis failed');
      return unknownResult(input.message);
    }
  },

  /**
   * Classify only — returns raw candidates without full resolution.
   * Useful for debugging or analytics.
   */
  async classify(message: string): Promise<readonly IntentCandidate[]> {
    try {
      const { rules } = await loadRules();
      return classifyMessage(message, rules);
    } catch {
      return [];
    }
  },

  /**
   * Resolve only — given pre-classified candidates, resolve to primary intent.
   */
  resolve(candidates: readonly IntentCandidate[]) {
    return resolveIntent(candidates);
  },

  /**
   * Select blueprint only — given industry + intent, return blueprint ID.
   */
  async selectBlueprint(industry: string, intent: string): Promise<string | null> {
    try {
      const { mappings } = await loadRules();
      return selectBlueprint(mappings, industry, intent as any);
    } catch {
      return null;
    }
  },

  /** Invalidate the rules cache (call when rules are updated) */
  invalidateCache(): void {
    intentRulesCache.invalidate();
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveDetectedService(
  entities:          readonly { type: string; value: string }[],
  availableServices?: readonly string[],
): string | null {
  // Prefer matched catalog service
  const serviceEntity = entities.find(e => e.type === 'service');
  if (!serviceEntity) return null;

  if (availableServices) {
    const match = availableServices.find(
      s => s.toLowerCase() === serviceEntity.value.toLowerCase()
    );
    if (match) return match;
  }

  return serviceEntity.value;
}

function buildReasoning(
  primary:    IntentCandidate,
  all:        readonly IntentCandidate[],
  urgency:    string,
  uSignals:   string[],
  blueprint:  string | null,
): string {
  const parts: string[] = [
    `Primary intent: ${primary.category} (score=${primary.score}, sub=${primary.subCategory || 'none'}).`,
    `Signals: ${primary.signals.join(', ') || 'none'}.`,
  ];

  if (all.length > 1) {
    parts.push(`Competing intents: ${all.slice(1, 3).map(c => `${c.category}(${c.score})`).join(', ')}.`);
  }

  if (urgency !== 'normal') {
    parts.push(`Urgency: ${urgency}. Triggers: ${uSignals.join(', ')}.`);
  }

  if (blueprint) {
    parts.push(`Blueprint selected: ${blueprint}.`);
  } else {
    parts.push('No blueprint mapping found — using generic flow.');
  }

  return parts.join(' ');
}
