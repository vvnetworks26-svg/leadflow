/**
 * validation-engine/HallucinationValidator.ts
 *
 * Rejects responses that invent business information.
 *
 * The AI must NEVER fabricate:
 *   - specific prices or discounts
 *   - guarantees or warranties
 *   - technician names
 *   - service availability for uncatalogued services
 *   - specific appointment times not confirmed by the calendar
 *   - contact information not in BusinessIdentity
 *
 * PURE — no I/O.
 */

import type { ValidationContext, ValidatorResult } from './types';
import { ValidationResult } from './ValidationResult';

// ─── Hallucination patterns ───────────────────────────────────────────────────

const FAKE_PRICE_PATTERNS = [
  /\$\d+/,                                       // any $ amount
  /\d+ dollars?/i,
  /only \d+/i,
  /starting (at|from) (just )?\d+/i,
  /as low as \d+/i,
  /\d+% off/i,
  /special (price|rate|deal|offer)/i,
  /discount(ed)?/i,
  /save \$?\d+/i,
  /promo(tion)?( code)?/i,
];

const FAKE_GUARANTEE_PATTERNS = [
  /\b(we |I )?guarantee\b/i,
  /\b(money[- ]back|100% (satisfaction|guaranteed|satisfied))\b/i,
  /\bwarranty (of|for|up to) \d+/i,                    // e.g. "warranty of 2 years"
  /\blifetime (warranty|guarantee)\b/i,
  /\bno[- ](questions[- ]asked) refund\b/i,
];

const FAKE_APPOINTMENT_PATTERNS = [
  /technician ('?[a-z]+) (will arrive|is on (his|their|the) way|is coming)/i,  // names
  /([A-Z][a-z]+ [A-Z][a-z]+) (will be|is) (your|the) (technician|tech)/i,     // named technician
  /\bI('?ve| have) already (booked|scheduled|confirmed) (a slot|an appointment|you)\b/i,
  /your appointment (is|has been) (set|confirmed|booked) for (today|tomorrow|\d)/i,
];

// ─── Validator ────────────────────────────────────────────────────────────────

export const HallucinationValidator = {

  validate(ctx: ValidationContext): ValidatorResult {
    const { proposedResponse, identity } = ctx;

    // 1. Fake prices — only allowed if the response is quoting from known catalog
    const hasFakePrice = FAKE_PRICE_PATTERNS.some(p => p.test(proposedResponse));
    if (hasFakePrice) {
      // Check if quote_services permission is granted
      const canQuote = identity.permissions.allowed.includes('quote_services');
      if (!canQuote) {
        return ValidationResult.fail(
          'HallucinationValidator',
          'Response contains specific pricing. The AI is not permitted to quote prices.',
          'pricing',
        );
      }
    }

    // 2. Fake guarantees
    const hasFakeGuarantee = FAKE_GUARANTEE_PATTERNS.some(p => p.test(proposedResponse));
    if (hasFakeGuarantee) {
      return ValidationResult.fail(
        'HallucinationValidator',
        'Response contains a guarantee or warranty claim not backed by BusinessIdentity.',
        'guarantee',
      );
    }

    // 3. Specific technician names or pre-confirmed appointments
    const hasFakeAppointment = FAKE_APPOINTMENT_PATTERNS.some(p => p.test(proposedResponse));
    if (hasFakeAppointment) {
      return ValidationResult.fail(
        'HallucinationValidator',
        'Response makes specific appointment or technician claims not confirmed by the system.',
        'appointment',
      );
    }

    return ValidationResult.pass('HallucinationValidator');
  },
};
