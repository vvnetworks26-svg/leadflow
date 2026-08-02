/**
 * Recovery Manager — detects anomalous turn patterns and adjusts objective.
 * Never restarts unnecessarily. Preserves context whenever possible. Pure function.
 */
import type { ConversationObjective, RecoveryStrategy } from '../types';
import type { IntentCategory }                          from '../../intent-engine/types';
import type { RichConversationMemory }                  from '../../ai/types';

export type RecoverySignal =
  | 'topic_change'
  | 'ambiguous_reply'
  | 'repeated_answer'
  | 'contradiction'
  | 'already_answered'
  | 'correction'
  | 'dont_know'
  | 'interrupt'
  | 'none';

export interface RecoveryInput {
  message:          string;
  intent:           IntentCategory;
  currentObjective: ConversationObjective;
  memory:           RichConversationMemory;
  strategy:         RecoveryStrategy;
  turnCount:        number;
}

export interface RecoveryResult {
  signal:      RecoverySignal;
  newObjective:ConversationObjective;
  reason:      string;
}

// ─── Signal detection patterns ────────────────────────────────────────────────

const ALREADY_ANSWERED_RE = /i (already|just) (told|said|gave|mentioned)|i (answered|said) that/i;
const DONT_KNOW_RE         = /i (don'?t|do not) know|not sure|no idea|can'?t remember/i;
const CORRECTION_RE        = /actually|wait|no,?\s+(my|i|the)|i meant|correction|sorry,?\s+i/i;
const TOPIC_CHANGE_INTENTS: IntentCategory[] = [
  'billing_question', 'employment', 'complaint', 'human_representative', 'general_question',
];

// ─── Public API ───────────────────────────────────────────────────────────────

export function detectRecoverySignal(input: RecoveryInput): RecoveryResult {
  const { message, intent, currentObjective, strategy } = input;
  const lower = message.toLowerCase();

  // Explicit "I already answered"
  if (ALREADY_ANSWERED_RE.test(lower)) {
    return { signal: 'already_answered', newObjective: currentObjective,
      reason: 'Customer indicated they already provided this information — keeping current objective' };
  }

  // "I don't know"
  if (DONT_KNOW_RE.test(lower)) {
    return { signal: 'dont_know', newObjective: strategy.onAmbiguity,
      reason: 'Customer indicated they do not know — clarifying' };
  }

  // Correction
  if (CORRECTION_RE.test(lower)) {
    return { signal: 'correction', newObjective: currentObjective,
      reason: 'Customer is correcting a previous answer — staying on objective to re-collect' };
  }

  // Topic change (different high-priority intent)
  if (TOPIC_CHANGE_INTENTS.includes(intent)) {
    const newObj = mapIntentToObjective(intent) ?? strategy.onTopicChange;
    return { signal: 'topic_change', newObjective: newObj,
      reason: `Topic changed to ${intent} — redirecting` };
  }

  return { signal: 'none', newObjective: currentObjective, reason: '' };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapIntentToObjective(intent: IntentCategory): ConversationObjective | null {
  const map: Partial<Record<IntentCategory, ConversationObjective>> = {
    billing_question:   'handle_billing',
    complaint:          'handle_complaint',
    employment:         'handle_employment',
    human_representative:'escalate_to_human',
    general_question:   'answer_question',
  };
  return map[intent] ?? null;
}
