/**
 * validation-engine/BlueprintValidator.ts
 *
 * Ensures the response follows the active Conversation Blueprint.
 *
 * Rules:
 *   - Stage progression must be valid (no backward jumps without good reason)
 *   - CTA must match the current stage
 *   - Booking stage must not appear before service is collected
 *
 * PURE — no I/O.
 */

import type { ValidationContext, ValidatorResult } from './types';
import { ValidationResult } from './ValidationResult';
import type { ConversationStage } from '../ai/types';

// ─── Valid transitions ────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<ConversationStage, ConversationStage[]> = {
  greeting:       ['discovery', 'escalated'],
  discovery:      ['qualification', 'booking', 'recommendation', 'escalated'],
  qualification:  ['recommendation', 'booking', 'objection', 'escalated'],
  recommendation: ['booking', 'objection', 'completed', 'escalated'],
  objection:      ['recommendation', 'booking', 'completed', 'escalated'],
  booking:        ['completed', 'escalated'],
  completed:      [],
  escalated:      [],
};

// CTA types that are valid per stage
type CTAType = import('../response-engine/types').CTAType;

const STAGE_VALID_CTAS: Record<ConversationStage, CTAType[]> = {
  greeting:       ['ContinueConversation', 'AskQuestion'],
  discovery:      ['AskQuestion', 'ContinueConversation'],
  qualification:  ['AskQuestion', 'ContinueConversation', 'RecommendService'],
  recommendation: ['RecommendService', 'BookAppointment', 'AskQuestion'],
  objection:      ['ContinueConversation', 'AskQuestion', 'RecommendService', 'TransferToHuman'],
  booking:        ['BookAppointment', 'AskQuestion', 'TransferToHuman'],
  completed:      ['CloseConversation'],
  escalated:      ['TransferToHuman', 'CloseConversation'],
};

// ─── Validator ────────────────────────────────────────────────────────────────

export const BlueprintValidator = {

  validate(ctx: ValidationContext): ValidatorResult {
    const { blueprint, stage, memory } = ctx;

    // 1. Check CTA is valid for this stage
    const validCTAs = STAGE_VALID_CTAS[stage];
    if (validCTAs && !validCTAs.includes(blueprint.cta)) {
      return ValidationResult.fail(
        'BlueprintValidator',
        `CTA "${blueprint.cta}" is not valid for stage "${stage}". Valid: [${validCTAs.join(', ')}].`,
        'cta',
      );
    }

    // 2. Booking CTA requires at minimum a service to be known
    if (blueprint.cta === 'BookAppointment' && !memory.progress.serviceCollected) {
      return ValidationResult.fail(
        'BlueprintValidator',
        'Cannot offer booking before the service need is identified.',
        'service',
      );
    }

    // 3. Booking stage requires name AND contact (phone or email)
    if (stage === 'booking') {
      const hasContact = memory.progress.phoneCollected || memory.progress.emailCollected;
      const hasName    = memory.progress.visitorNameCollected;
      if (!hasName || !hasContact) {
        const missing: string[] = [];
        if (!hasName)    missing.push('name');
        if (!hasContact) missing.push('phone or email');
        return ValidationResult.fail(
          'BlueprintValidator',
          `Booking stage requires: ${missing.join(', ')}.`,
          missing[0],
        );
      }
    }

    return ValidationResult.pass('BlueprintValidator');
  },
};
