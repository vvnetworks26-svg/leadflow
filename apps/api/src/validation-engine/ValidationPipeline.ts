/**
 * validation-engine/ValidationPipeline.ts
 *
 * Coordinates all validators in priority order.
 * Short-circuits on first hard failure.
 * Produces a deterministic fallback when validation fails.
 *
 * Pipeline order (as specified):
 *   1.  MemoryValidator
 *   2.  BlueprintValidator
 *   3.  ObjectiveValidator
 *   4.  RepetitionValidator
 *   5.  ToneValidator
 *   6.  UrgencyValidator
 *   7.  BookingValidator
 *   8.  BusinessRuleValidator
 *   9.  HallucinationValidator
 *   10. (Response Quality — inline, last gate)
 *
 * PURE — synchronous, no I/O, no DB, no network.
 */

import type { ValidationContext, ValidationPipelineResult, ValidatorResult } from './types';
import { MemoryValidator }        from './MemoryValidator';
import { BlueprintValidator }     from './BlueprintValidator';
import { ObjectiveValidator }     from './ObjectiveValidator';
import { RepetitionValidator }    from './RepetitionValidator';
import { ToneValidator }          from './ToneValidator';
import { UrgencyValidator }       from './UrgencyValidator';
import { BookingValidator }       from './BookingValidator';
import { BusinessRuleValidator }  from './BusinessRuleValidator';
import { HallucinationValidator } from './HallucinationValidator';
import { FallbackResponseBuilder } from './FallbackResponseBuilder';
import { ValidationResult }       from './ValidationResult';

// ─── Response quality gate ────────────────────────────────────────────────────

const QUALITY_PATTERNS = {
  helpsCustomer: [
    /i('?m| am) sorry/i,
    /let (me|us) (help|assist|get)/i,
    /we (can|will|would)/i,
    /to (help|assist|resolve|address)/i,
    /here (is|are|'s)/i,
    /\?/,   // any question = moves conversation forward
  ],
  helpsBusiness: [
    /\bschedule\b/i,
    /\bappointment\b/i,
    /\bbook\b/i,
    /\bcontact\b/i,
    /\bleave (your|a)\b/i,
    /\bteam\b/i,
  ],
  movesForward: [
    /\?/,
    /let('?s| us) (start|begin|get)/i,
    /first\b/i,
    /next\b/i,
    /to get (started|you|the right)/i,
    /in order to/i,
  ],
};

function passesQualityGate(response: string): boolean {
  const r = response;
  return (
    QUALITY_PATTERNS.helpsCustomer.some(p => p.test(r)) ||
    QUALITY_PATTERNS.helpsBusiness.some(p => p.test(r)) ||
    QUALITY_PATTERNS.movesForward.some(p => p.test(r))
  );
}

// ─── Validator list ───────────────────────────────────────────────────────────

type Validator = { validate(ctx: ValidationContext): ValidatorResult };

const VALIDATORS: Validator[] = [
  MemoryValidator,
  BlueprintValidator,
  ObjectiveValidator,
  RepetitionValidator,
  ToneValidator,
  UrgencyValidator,
  BookingValidator,
  BusinessRuleValidator,
  HallucinationValidator,
];

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export const ValidationPipeline = {

  /**
   * Run all validators against the proposed response.
   * Returns the approved response (original or fallback) and full audit trail.
   */
  run(ctx: ValidationContext): ValidationPipelineResult {
    const startMs  = Date.now();
    const results:  ValidatorResult[] = [];
    let   failedValidator: string | null = null;

    // Run each validator in order
    for (const validator of VALIDATORS) {
      const result = validator.validate(ctx);
      results.push(result);

      if (result.status === 'fail') {
        failedValidator = result.validator;
        break;   // short-circuit on first failure
      }
      // warn = continue (advisory only)
    }

    // Response quality gate (runs only if all validators passed)
    if (!failedValidator) {
      const qualityOk = passesQualityGate(ctx.proposedResponse);
      if (!qualityOk) {
        const qualityResult = ValidationResult.fail(
          'ResponseQualityValidator',
          'Response does not help the customer, help the business, or move the conversation forward.',
        );
        results.push(qualityResult);
        failedValidator = qualityResult.validator;
      } else {
        results.push(ValidationResult.pass('ResponseQualityValidator'));
      }
    }

    const approved = failedValidator === null;
    const fallbackUsed = !approved;

    const finalResponse = approved
      ? ctx.proposedResponse
      : FallbackResponseBuilder.build(failedValidator!, ctx);

    return {
      approved,
      finalResponse,
      results,
      fallbackUsed,
      failedValidator,
      durationMs: Date.now() - startMs,
    };
  },
};
