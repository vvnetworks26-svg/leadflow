/**
 * prompt-assembly/InstructionComposer.ts
 *
 * Merges BusinessIdentity + ConversationPlan + ResponseBlueprint into a
 * single, non-contradictory instruction block.
 *
 * No duplicate instructions.
 * No contradictory instructions.
 * Gemini reads this as its primary directive.
 * Pure function.
 */

import type { BusinessIdentity } from '../business-identity/types';
import type { ConversationPlan as L3Plan } from '../conversation-engine/types';
import type { ResponseBlueprint } from '../response-engine/types';
import type { QualificationScore } from '../ai/types';

export function composeInstructions(params: {
  identity:      BusinessIdentity;
  plan:          L3Plan;
  blueprint:     ResponseBlueprint;
  qualification: QualificationScore;
  currentPage?:  string;
}): string {
  const { identity, plan, blueprint, qualification, currentPage } = params;
  const { companyProfile: cp, receptionistIdentity: ri, brandPersonality: bp } = identity;
  const lines: string[] = ['[INSTRUCTIONS]'];

  // ── Identity ──────────────────────────────────────────────────────────────
  lines.push(`You are ${ri.aiName}, ${ri.role} for ${cp.businessName}.`);
  lines.push(`Industry: ${cp.industry}.`);
  lines.push(`Communication style: ${blueprint.tone} — ${bp.tone}, ${bp.energy} energy, ${bp.empathy} empathy.`);
  lines.push(`Sentence style: ${bp.sentenceStyle}. Emoji policy: ${bp.emojiPolicy}.`);

  // ── Core behavioral rules ─────────────────────────────────────────────────
  lines.push('');
  lines.push('CORE RULES:');
  lines.push('- Ask exactly ONE question per message.');
  lines.push('- Never repeat a question already answered (check memory above).');
  lines.push('- Keep responses focused on the current objective.');
  lines.push(`- Response length: ${blueprint.length}.`);
  lines.push(`- Response style: ${blueprint.style}.`);

  // ── Current objective ─────────────────────────────────────────────────────
  lines.push('');
  lines.push(`CURRENT OBJECTIVE: ${plan.objective}`);
  lines.push(`Reason: ${plan.reason}`);
  if (plan.requiredField) lines.push(`Required field: ${plan.requiredField}`);
  lines.push(`Priority: ${plan.priority}`);

  // ── CTA ───────────────────────────────────────────────────────────────────
  lines.push(`Desired outcome of this message: ${blueprint.cta}`);

  // ── Qualification context ─────────────────────────────────────────────────
  lines.push('');
  lines.push(`LEAD STATUS: Score ${qualification.overall}/100 (${qualification.temperature}).`);
  if (qualification.missingInfo.length > 0) {
    lines.push(`Still need: ${qualification.missingInfo.join(', ')}.`);
  }

  // ── Page context ──────────────────────────────────────────────────────────
  if (currentPage) {
    lines.push(`Visitor is currently on: ${currentPage}.`);
  }

  // ── Services ──────────────────────────────────────────────────────────────
  const activeServices = identity.servicesCatalog.filter(s => s.enabled).map(s => s.name);
  if (activeServices.length > 0) {
    lines.push(`Available services: ${activeServices.join(', ')}.`);
  }

  // ── FAQ context ───────────────────────────────────────────────────────────
  const faqEntries = (identity as any).aiConfig?.faq ?? [];
  if (faqEntries.length > 0) {
    lines.push('Frequently asked questions:');
    for (const f of faqEntries.slice(0, 5)) {
      lines.push(`  Q: ${f.question}  A: ${f.answer}`);
    }
  }

  lines.push('[/INSTRUCTIONS]');
  return lines.join('\n');
}
