/**
 * validation-engine/ValidationResult.ts
 *
 * Factory helpers for building ValidatorResult objects.
 * Pure utility — no logic of its own.
 */

import type { ValidatorResult, ValidationStatus } from './types';

export const ValidationResult = {

  pass(validator: string): ValidatorResult {
    return { validator, status: 'pass' };
  },

  fail(validator: string, reason: string, field?: string): ValidatorResult {
    return { validator, status: 'fail', reason, field };
  },

  warn(validator: string, reason: string, field?: string): ValidatorResult {
    return { validator, status: 'warn', reason, field };
  },
};
