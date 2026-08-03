/**
 * validation-engine/ValidationEngine.ts
 *
 * Layer 7 — Validation Engine.
 *
 * Public entry point. Wraps ValidationPipeline with a clean API.
 *
 * The existing runOrchestrator() public interface is unchanged.
 * Layer 7 is inserted AFTER the Response Engine produces its reply,
 * BEFORE the reply is returned to the customer.
 *
 * Usage in runOrchestrator():
 *
 *   // After Gemini produces `reply`:
 *   const validationCtx: ValidationContext = {
 *     proposedResponse: reply,
 *     stage:            nextStage,
 *     blueprint,
 *     memory:           richMemory,
 *     history,
 *     urgency:          intent.urgency,
 *     identity,
 *     turnCount,
 *   };
 *   const validated = ValidationEngine.validate(validationCtx);
 *   reply = validated.finalResponse;
 *
 * PURE — synchronous, no I/O.
 */

import type { ValidationContext, ValidationPipelineResult } from './types';
import { ValidationPipeline } from './ValidationPipeline';

export const ValidationEngine = {

  /**
   * Validate the proposed response.
   * Returns the approved response (original or deterministic fallback).
   */
  validate(ctx: ValidationContext): ValidationPipelineResult {
    return ValidationPipeline.run(ctx);
  },

  /**
   * Quick check: returns true if the response would pass validation.
   * Useful for unit tests and health checks.
   */
  isValid(ctx: ValidationContext): boolean {
    return ValidationPipeline.run(ctx).approved;
  },
};
