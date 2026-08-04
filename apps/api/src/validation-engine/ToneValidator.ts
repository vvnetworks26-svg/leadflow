/**
 * validation-engine/ToneValidator.ts
 *
 * Verifies the response tone matches the business brand.
 *
 * Each industry has a set of required tone signals and forbidden patterns.
 * Tone is validated by keyword presence/absence, not LLM scoring.
 *
 * PURE — no I/O.
 */

import type { ValidationContext, ValidatorResult } from './types';
import { ValidationResult } from './ValidationResult';
import type { Tone } from '../response-engine/types';

// ─── Tone rules per tone type ─────────────────────────────────────────────────

interface ToneRule {
  forbidden: RegExp[];   // patterns that violate this tone
}

const TONE_RULES: Partial<Record<Tone, ToneRule>> = {
  Dispatcher: {
    forbidden: [
      /i (think|believe|guess|feel like)/i,
      /maybe|perhaps|possibly/i,
      /not sure|unclear/i,
    ],
  },
  Luxury: {
    forbidden: [
      /\bwhat's up\b/i,
      /\bcheap\b/i,
      /\baffordable\b/i,
      /\bdeal\b/i,
      /\byeah\b/i,
      /\bnp\b/i,   // "no problem" abbreviation
    ],
  },
  Professional: {
    forbidden: [
      /\blol\b/i,
      /\bttyl\b/i,
      /\bomg\b/i,
      /\bhaha\b/i,
      /\bnah\b/i,
    ],
  },
};

// Industry → expected blueprint tone
const INDUSTRY_TONE_MAP: Record<string, Tone[]> = {
  hvac:        ['Friendly', 'Professional', 'Dispatcher', 'Urgent'],
  plumbing:    ['Friendly', 'Professional', 'Dispatcher', 'Urgent'],
  roofing:     ['Confident', 'Professional', 'Consultative'],
  electrical:  ['Professional', 'Calm', 'Dispatcher'],
  pest_control:['Friendly', 'Professional', 'Calm'],
  landscaping: ['Friendly', 'Professional', 'Consultative'],
  cleaning:    ['Friendly', 'Professional', 'Calm'],
  saas:        ['Consultative', 'Professional', 'Educational', 'Confident'],
  agency:      ['Consultative', 'Professional', 'Educational'],
  real_estate: ['Consultative', 'Professional', 'Luxury'],
  general:     ['Friendly', 'Professional'],
};

// ─── Validator ────────────────────────────────────────────────────────────────

export const ToneValidator = {

  validate(ctx: ValidationContext): ValidatorResult {
    const { blueprint, identity, proposedResponse } = ctx;
    const industry = identity.companyProfile.industry;
    const tone     = blueprint.tone;

    // 1. Check that the tone is acceptable for this industry
    const allowed = INDUSTRY_TONE_MAP[industry] ?? INDUSTRY_TONE_MAP['general']!;
    if (!allowed.includes(tone)) {
      return ValidationResult.fail(
        'ToneValidator',
        `Tone "${tone}" is not appropriate for industry "${industry}". Expected one of: ${allowed.join(', ')}.`,
        'tone',
      );
    }

    // 2. Check tone-specific forbidden patterns in the response text
    const rule = TONE_RULES[tone];
    if (rule) {
      for (const pattern of rule.forbidden) {
        if (pattern.test(proposedResponse)) {
          return ValidationResult.fail(
            'ToneValidator',
            `Response contains language that violates "${tone}" tone: "${pattern.source}".`,
            'tone',
          );
        }
      }
    }

    return ValidationResult.pass('ToneValidator');
  },
};
