/**
 * ai/guardrails.ts
 *
 * Safety layer that runs BEFORE and AFTER every AI request.
 *
 * Pre-checks: block prompt injection attempts, harmful input.
 * Post-checks: strip hallucinated prices, invented integrations, dangerous content.
 */

import type { GuardrailResult } from './types';

// ─── Blocklists ───────────────────────────────────────────────────────────────

const PROMPT_INJECTION_PATTERNS = [
  /ignore (previous|all|above|prior) instructions?/i,
  /you are now/i,
  /pretend (you are|to be|you're)/i,
  /act as (a|an|the)\s+\w/i,
  /forget (everything|all|prior|previous)/i,
  /disregard (your|all|previous|above)/i,
  /system prompt/i,
  /\bDAN\b/,         // jailbreak persona
  /jailbreak/i,
  /<\|im_start\|>/i, // token injection
  /\[INST\]/i,
];

const HARMFUL_CONTENT_PATTERNS = [
  /how to (make|build|create) (a )?(bomb|weapon|explosive|poison)/i,
  /suicide|self.harm|kill (myself|yourself)/i,
  /(buy|sell) (drugs?|narcotics?|cocaine|heroin|meth)/i,
  /child (porn|abuse|exploitation)/i,
];

const HALLUCINATION_PRICE_PATTERNS = [
  // If AI invents very specific pricing not in the knowledge base
  /\$\d{1,3},\d{3}(?:\.\d{2})?\s*(?:per|\/)\s*(?:month|year|user|seat)/gi,
];

const NEVER_CLAIM_PATTERNS = [
  // AI should not claim to be human or a real person
  /i\s+am\s+(?:a\s+|an\s+)?(?:real\s+)?(?:human|person)/i,
  /i'?m\s+(?:a\s+|an\s+)?(?:real\s+)?(?:human|person)/i,
  /not\s+an?\s+ai/i,
];

// ─── Known valid integrations (to prevent hallucination) ─────────────────────

const VALID_INTEGRATIONS = new Set([
  'salesforce', 'hubspot', 'pipedrive', 'zoho', 'monday',
  'google calendar', 'outlook', 'calendly', 'cal.com',
  'zapier', 'make', 'webhook', 'rest api', 'openapi',
  'slack', 'gmail', 'stripe', 'twilio',
]);

// ─── Input guardrail ──────────────────────────────────────────────────────────

/**
 * Check user input BEFORE passing to the LLM.
 * Returns { passed: false } if the input should be blocked.
 */
export function checkInput(userMessage: string): GuardrailResult {
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(userMessage)) {
      return {
        passed: false,
        safe:   false,
        reason: 'Your message contains content that cannot be processed. Please ask about our products or services.',
      };
    }
  }

  for (const pattern of HARMFUL_CONTENT_PATTERNS) {
    if (pattern.test(userMessage)) {
      return {
        passed: false,
        safe:   false,
        reason: 'I\'m not able to help with that. If you need urgent assistance, please contact emergency services.',
      };
    }
  }

  return { passed: true, safe: true };
}

/**
 * Check AI output AFTER generation.
 * Strips or replaces problematic content.
 */
export function checkOutput(aiReply: string): GuardrailResult & { sanitized: string } {
  let sanitized = aiReply;

  // Never claim to be human
  for (const pattern of NEVER_CLAIM_PATTERNS) {
    if (pattern.test(sanitized)) {
      sanitized = sanitized.replace(pattern, 'I\'m an AI assistant');
    }
  }

  // Flag if AI is claiming specific integration names not in our validated list
  const mentionedIntegrations = sanitized.match(/integrates? with ([A-Z][a-zA-Z]+)/gi) ?? [];
  for (const mention of mentionedIntegrations) {
    const name = mention.replace(/integrates? with /i, '').toLowerCase();
    if (!VALID_INTEGRATIONS.has(name)) {
      // Soften the claim
      sanitized = sanitized.replace(
        new RegExp(mention, 'gi'),
        `connects with various tools (verify with our team)`
      );
    }
  }

  // Strip suspiciously specific fabricated prices if the format looks invented
  // (this is a soft check — we allow known pricing from knowledge base)
  const hasSuspiciousPrice = HALLUCINATION_PRICE_PATTERNS.some(p => p.test(sanitized));

  // Check for legal/medical advice claims
  const hasAdviceClaim = /this is (not|legal|medical|financial) advice|consult (a |your )?(doctor|lawyer|attorney|accountant)/i.test(sanitized);

  // Defence-in-depth: incomplete/truncated reply detection.
  // Deliberately a detector, not a rewriter — a reply cut off mid-sentence is
  // a symptom of an upstream generation problem (output-token budget), and
  // silently patching the text here would hide that. Flagging it surfaces a
  // guardrail_blocked analytics event while leaving the text untouched.
  const isTruncated = looksTruncated(sanitized);

  if (hasSuspiciousPrice) {
    sanitized = sanitized.replace(
      /\$[\d,]+(?:\.\d{2})?\s*(?:per|\/)\s*(?:month|year|user|seat)/gi,
      'contact us for pricing'
    );
  }

  return {
    passed:    true,
    safe:      !hasSuspiciousPrice && !hasAdviceClaim && !isTruncated,
    sanitized,
    reason:    hasSuspiciousPrice ? 'Pricing sanitized'
             : isTruncated        ? 'Reply appears truncated'
             : undefined,
  };
}

/**
 * Cheap heuristic for a reply that stops mid-thought.
 *
 * Intentionally conservative — it only fires on the unambiguous case (no
 * terminal punctuation at all), because normal replies legitimately end in
 * '.', '?', '!', an ellipsis, or a closing quote/bracket/emoji. A trailing
 * ':' counts as complete too: the booking flow's slot-list lead-in ("Here are
 * our next available times:") is a normal, finished reply. Empty replies count
 * as incomplete: an empty string is never a valid answer.
 */
function looksTruncated(reply: string): boolean {
  const trimmed = reply.trim();
  if (trimmed.length === 0) return true;

  // Strip trailing closers/emoji so `He said "hello."` and `Great! 🎉` still
  // resolve to their real terminal punctuation.
  const stripped = trimmed.replace(/[\s"'”’)\]\p{Extended_Pictographic}]+$/u, '');
  if (stripped.length === 0) return false;   // punctuation/emoji-only reply

  return !/[.!?…:]$/.test(stripped);
}

/**
 * Generate a safe fallback response when the AI fails or is blocked.
 */
export function fallbackResponse(reason?: string): string {
  if (reason) return reason;
  return `I'm not sure about that one — let me connect you with a member of our team who can give you the right answer. Could you share your name and email so we can follow up?`;
}
