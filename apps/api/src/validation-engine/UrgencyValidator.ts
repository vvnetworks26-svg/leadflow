/**
 * validation-engine/UrgencyValidator.ts
 *
 * Emergency conversations must receive emergency-appropriate responses.
 *
 * Rules:
 *   - Critical/emergency urgency → response must acknowledge urgency
 *   - Critical/emergency → must NOT ask low-priority qualification questions
 *   - Critical/emergency → must NOT be a generic marketing/recommendation response
 *   - Normal urgency → no restriction
 *
 * PURE — no I/O.
 */

import type { ValidationContext, ValidatorResult } from './types';
import { ValidationResult } from './ValidationResult';

// ─── Urgency signal patterns ──────────────────────────────────────────────────

const URGENCY_ACKNOWLEDGEMENTS = [
  /i('?m| am) sorry/i,
  /understand(ing)? (that|how|this)/i,
  /right away/i,
  /as (quickly|soon) as possible/i,
  /immediately/i,
  /urgent/i,
  /emergency/i,
  /get someone (out|there|to you)/i,
  /top priority/i,
  /dispatch/i,
  /send (a tech|someone|a team)/i,
];

const LOW_PRIORITY_QUESTIONS = [
  /what('?s| is) your budget/i,
  /how (many|much) employee/i,
  /how did you hear about us/i,
  /which plan (are you|do you)/i,
  /are you (the )?decision maker/i,
  /what is your timeline/i,
  /what('?s| is) your company size/i,
];

const GENERIC_RESPONSES = [
  /check out our (plans|pricing|services)/i,
  /i('?d| would) love to tell you about/i,
  /let me show you (what|how)/i,
  /here are (our|some) (options|plans|services)/i,
];

// ─── Validator ────────────────────────────────────────────────────────────────

export const UrgencyValidator = {

  validate(ctx: ValidationContext): ValidatorResult {
    const { urgency, proposedResponse, stage } = ctx;

    if (urgency !== 'critical' && urgency !== 'emergency') {
      return ValidationResult.pass('UrgencyValidator');
    }

    // Must acknowledge the urgency
    const acknowledges = URGENCY_ACKNOWLEDGEMENTS.some(p => p.test(proposedResponse));
    if (!acknowledges) {
      return ValidationResult.fail(
        'UrgencyValidator',
        'Emergency situation detected but response does not acknowledge urgency.',
        'urgency',
      );
    }

    // Must NOT ask low-priority qualification questions
    const asksLowPriority = LOW_PRIORITY_QUESTIONS.some(p => p.test(proposedResponse));
    if (asksLowPriority) {
      return ValidationResult.fail(
        'UrgencyValidator',
        'Emergency situation: do not ask low-priority qualification questions.',
        'urgency',
      );
    }

    // Must NOT be a generic recommendation/marketing response
    const isGeneric = GENERIC_RESPONSES.some(p => p.test(proposedResponse));
    if (isGeneric) {
      return ValidationResult.fail(
        'UrgencyValidator',
        'Emergency situation: response must focus on dispatch, not marketing.',
        'urgency',
      );
    }

    return ValidationResult.pass('UrgencyValidator');
  },
};
