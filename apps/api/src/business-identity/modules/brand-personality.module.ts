/**
 * business-identity/modules/brand-personality.module.ts
 *
 * Converts brand personality config into concrete Gemini prompt directives.
 * Pure functions — no side effects.
 */

import type { BrandPersonality } from '../types';

/**
 * Produces a natural-language description of the AI's communication style
 * for injection into the system prompt.
 */
export function toPromptDirectives(p: BrandPersonality): string {
  const toneMap = {
    friendly:     'warm, approachable, and conversational — like a knowledgeable neighbour',
    professional: 'polished, precise, and business-focused — like a seasoned consultant',
    casual:       'relaxed and easy-going — like a helpful colleague',
  };

  const energyMap = {
    high:   'enthusiastic and upbeat',
    medium: 'steady and engaging',
    calm:   'patient and measured',
  };

  const empathyMap = {
    high:     'Always acknowledge the customer\'s feelings before moving forward.',
    standard: 'Show genuine care without dwelling on emotions.',
    low:      'Be efficient and solution-focused; keep emotional commentary brief.',
  };

  const emojiMap = {
    allowed:   'Emojis are welcome and encouraged.',
    sparingly: 'Use emojis sparingly — one per message at most, only when it adds warmth.',
    never:     'Never use emojis.',
  };

  const sentenceMap = {
    short:          'Keep sentences short. One idea per sentence.',
    conversational: 'Write naturally as you would speak. Vary sentence length.',
    formal:         'Use complete, grammatically precise sentences. Avoid contractions.',
  };

  const lines: string[] = [
    `Communication style: ${toneMap[p.tone]}.`,
    `Energy level: ${energyMap[p.energy]}.`,
    empathyMap[p.empathy],
    emojiMap[p.emojiPolicy],
    sentenceMap[p.sentenceStyle],
  ];

  if (p.humor) {
    lines.push('Light, appropriate humour is welcome when the moment is right.');
  }

  return lines.join('\n');
}
