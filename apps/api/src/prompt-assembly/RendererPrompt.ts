/**
 * prompt-assembly/RendererPrompt.ts
 *
 * Serializes a ResponseBlueprint into structured renderer instructions.
 * Gemini reads these as directives — not prose.
 * Pure function.
 */

import type { ResponseBlueprint } from '../response-engine/types';

export function serializeBlueprint(blueprint: ResponseBlueprint): string {
  const { personalization: p } = blueprint;
  const lines: string[] = ['[RESPONSE BLUEPRINT]'];

  lines.push(`Objective: ${blueprint.objective}`);
  lines.push(`Tone: ${blueprint.tone}`);
  lines.push(`Emotion: ${blueprint.emotion}`);
  lines.push(`Urgency: ${blueprint.urgency}`);
  lines.push(`CTA: ${blueprint.cta}`);
  lines.push(`Length: ${blueprint.length}`);
  lines.push(`Style: ${blueprint.style}`);

  if (blueprint.question) {
    lines.push(`Question to Ask: "${blueprint.question}"`);
  }

  if (p.visitorName || p.company || p.service) {
    lines.push('Personalization:');
    if (p.visitorName) lines.push(`  - Address customer as: ${p.visitorName}`);
    if (p.company)     lines.push(`  - Company: ${p.company}`);
    if (p.service)     lines.push(`  - Service: ${p.service}`);
  }

  if (blueprint.mustMention.length > 0) {
    lines.push('Must Mention:');
    for (const item of blueprint.mustMention) lines.push(`  - ${item}`);
  }

  if (blueprint.mustAvoid.length > 0) {
    lines.push('Must Avoid:');
    for (const item of blueprint.mustAvoid) lines.push(`  - ${item}`);
  }

  if (blueprint.examples.length > 0) {
    lines.push('Example Phrasings (style guidance only — do not copy verbatim):');
    for (const ex of blueprint.examples) lines.push(`  ${ex}`);
  }

  lines.push('[/RESPONSE BLUEPRINT]');
  return lines.join('\n');
}
