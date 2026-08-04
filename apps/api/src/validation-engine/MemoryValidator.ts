/**
 * validation-engine/MemoryValidator.ts
 *
 * Prevents asking for information that is already in memory.
 *
 * Rules:
 *   - If the field is already collected (progress flag = true), the response
 *     must not ask for it again.
 *   - Checks both exact-field questions and paraphrase patterns.
 *
 * PURE — no I/O, no side effects.
 */

import type { ValidationContext, ValidatorResult } from './types';
import { ValidationResult } from './ValidationResult';

// ─── Field patterns ───────────────────────────────────────────────────────────

interface FieldPattern {
  field:     string;
  collected: (ctx: ValidationContext) => boolean;
  patterns:  RegExp[];
}

const FIELD_PATTERNS: FieldPattern[] = [
  {
    field:     'name',
    collected: ctx => ctx.memory.progress.visitorNameCollected,
    patterns:  [
      /what('?s| is) your name/i,
      /can i (get|have) your name/i,
      /may i (get|ask|have) your name/i,
      /your (full )?name/i,
    ],
  },
  {
    field:     'phone',
    collected: ctx => ctx.memory.progress.phoneCollected,
    patterns:  [
      /what('?s| is) (your |the best )?( phone|number|cell|mobile)/i,
      /best (number|way) to reach you/i,
      /phone number/i,
      /contact number/i,
      /reach you (at|on)/i,
    ],
  },
  {
    field:     'email',
    collected: ctx => ctx.memory.progress.emailCollected,
    patterns:  [
      /what('?s| is) your email/i,
      /email address/i,
      /can i (get|have) your email/i,
    ],
  },
  {
    field:     'address',
    collected: ctx => ctx.memory.progress.addressCollected,
    patterns:  [
      /what('?s| is) (your |the )?address/i,
      /service address/i,
      /where (are you|do you live|is the (home|property|location))/i,
      /your location/i,
    ],
  },
  {
    field:     'service',
    collected: ctx => ctx.memory.progress.serviceCollected,
    patterns:  [
      /what (service|type of service|kind of service|issue)/i,
      /what (are you looking for|can i help you with|brings you)/i,
      /what('?s| is) the (problem|issue|concern)/i,
    ],
  },
  {
    field:     'preferredTime',
    collected: ctx => ctx.memory.progress.appointmentCollected,
    patterns:  [
      /when (would|are you|works) (you like|available|for you)/i,
      /preferred (time|date|day)/i,
      /best time (for you|to schedule|to come out)/i,
      /what time/i,
    ],
  },
];

// ─── Validator ────────────────────────────────────────────────────────────────

export const MemoryValidator = {

  validate(ctx: ValidationContext): ValidatorResult {
    const resp = ctx.proposedResponse;

    for (const fp of FIELD_PATTERNS) {
      if (!fp.collected(ctx)) continue;   // not yet collected — asking is fine

      const asksForField = fp.patterns.some(p => p.test(resp));
      if (asksForField) {
        return ValidationResult.fail(
          'MemoryValidator',
          `Already collected: ${fp.field}. Do not ask again.`,
          fp.field,
        );
      }
    }

    return ValidationResult.pass('MemoryValidator');
  },
};
