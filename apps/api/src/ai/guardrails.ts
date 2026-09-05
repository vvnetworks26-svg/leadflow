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

// ─── Fake booking confirmation patterns ────────────────────────────────────────
//
// Defence in depth for the false-confirmation bug: Gemini has no way to know
// whether a booking was actually persisted (memory.bookingStatus is set to
// 'booked' nowhere except a successful POST /book — see widgetController.ts),
// yet nothing stopped it from generating confident "you're booked" language at
// the confirm_appointment/offer_appointment objectives. The prompt no longer
// instructs it to (ResponsePlanner.buildExamples / Humanizer.buildMustMention
// are now gated on bookingStatus === 'booked'), but models don't perfectly
// follow instructions — this is the backstop, not the primary fix.
//
// Split into two tiers, learned from testing this against a real fallback-
// template variant ("You're all set! Your appointment is confirmed and
// {company} will follow up shortly") that doesn't restate a time at all:
//
// STRONG patterns have no legitimate non-booking reading — "your appointment
// is confirmed" always means a booking exists — so they fire on their own.
//
// WEAK patterns (just "you're all set") are also common, harmless wrap-up
// language with no booking involved at all, so they only count alongside a
// concrete time/day reference — mirroring the real incident ("You are all
// set, Siri! I have booked your AC service appointment for tomorrow at
// 7:00 PM", which also matches a STRONG pattern on "I have booked" anyway).
const STRONG_BOOKING_CONFIRMATION_PATTERNS = [
  /i(?:'ve| have)\s+(?:booked|scheduled|confirmed)\b/i,
  /(?:your|the)\s+appointment\s+(?:is|has been)\s+(?:booked|confirmed|scheduled)/i,
  /booking\s+(?:is|has been)\s+confirmed/i,
  /you(?:'re| are)\s+(?:booked|confirmed)\s+for/i,
];

const WEAK_BOOKING_CONFIRMATION_PATTERNS = [
  /you(?:'re| are)\s+all\s+(?:set|booked)/i,
];

const TIME_OR_DAY_REFERENCE_PATTERNS = [
  /\b(?:mon|tues?|wednes|thurs?|fri|satur|sun)day\b/i,
  /\btomorrow\b/i,
  /\btoday\b/i,
  /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i,
];

/**
 * True when a reply reads like it's confirming a real, completed booking
 * (confirmation phrasing + a named time/day) while no booking was actually
 * persisted for this session (bookingStatus !== 'booked').
 */
function looksLikeFakeBookingConfirmation(
  reply:         string,
  bookingStatus: 'none' | 'requested' | 'booked',
): boolean {
  if (bookingStatus === 'booked') return false; // a real booking exists — confirming it is correct
  if (STRONG_BOOKING_CONFIRMATION_PATTERNS.some(p => p.test(reply))) return true;
  if (!WEAK_BOOKING_CONFIRMATION_PATTERNS.some(p => p.test(reply))) return false;
  return TIME_OR_DAY_REFERENCE_PATTERNS.some(p => p.test(reply));
}

const FAKE_BOOKING_FALLBACK_REPLY =
  "Let's get that locked in properly — let me pull up our real-time availability so you can pick a time that works.";

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
export function checkOutput(
  aiReply:       string,
  bookingStatus: 'none' | 'requested' | 'booked' = 'none',
): GuardrailResult & { sanitized: string } {
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

  // Defence in depth: a reply that sounds like it's confirming a real booking
  // when no booking was actually persisted for this session. Unlike the other
  // checks here, this one REWRITES the reply rather than just flagging it —
  // sending the fabricated claim to the visitor is the harm itself, so
  // passing it through untouched (the way looksTruncated() does) would defeat
  // the point of catching it at all.
  const isFakeBookingConfirmation = looksLikeFakeBookingConfirmation(sanitized, bookingStatus);

  if (hasSuspiciousPrice) {
    sanitized = sanitized.replace(
      /\$[\d,]+(?:\.\d{2})?\s*(?:per|\/)\s*(?:month|year|user|seat)/gi,
      'contact us for pricing'
    );
  }

  if (isFakeBookingConfirmation) {
    sanitized = FAKE_BOOKING_FALLBACK_REPLY;
  }

  return {
    passed:    true,
    safe:      !hasSuspiciousPrice && !hasAdviceClaim && !isTruncated && !isFakeBookingConfirmation,
    sanitized,
    reason:    isFakeBookingConfirmation ? 'Blocked fabricated booking confirmation'
             : hasSuspiciousPrice        ? 'Pricing sanitized'
             : isTruncated               ? 'Reply appears truncated'
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
