/**
 * ai/intent.ts
 *
 * Rule-based + LLM-assisted intent classifier.
 * First pass: fast keyword scoring.
 * Second pass: AI-verified confidence (used when fast-pass is ambiguous).
 */

import type { DetectedIntent, IntentType } from './types';

// ─── Keyword maps ─────────────────────────────────────────────────────────────

const INTENT_KEYWORDS: Record<IntentType, string[]> = {
  Greeting: [
    'hello', 'hi there', 'hey there', 'good morning', 'good afternoon', 'good evening',
    'howdy', 'greetings', 'what\'s up', 'howdy',
  ],
  Question: [
    'what is', 'what are', 'how does', 'how do', 'can you', 'could you',
    'tell me', 'explain', 'describe', 'i want to know', 'wondering',
  ],
  Pricing: [
    'price', 'cost', 'how much', 'pricing', 'rates', 'fee', 'charge',
    'subscription', 'plan', 'affordable', 'expensive', 'cheap', 'budget',
    'free trial', 'discount', 'roi', 'return on investment',
  ],
  Feature: [
    'feature', 'capability', 'function', 'does it', 'can it', 'ability',
    'integration', 'work with', 'supports', 'handle', 'include',
  ],
  LeadFlow: [
    'leadflow', 'lead flow', 'your product', 'your software', 'your platform',
    'this tool', 'this app', 'this system', 'your service', 'your crm',
  ],
  Website: [
    'website', 'web design', 'web development', 'landing page', 'redesign',
    'site', 'web presence', 'seo', 'traffic', 'conversion', 'cms',
  ],
  Automation: [
    'automate', 'automation', 'workflow', 'process', 'manual work',
    'save time', 'repetitive', 'trigger', 'no-code', 'zapier', 'make',
    'automatic', 'scheduled', 'batch',
  ],
  Support: [
    'help', 'support', 'problem', 'issue', 'bug', 'error', 'not working',
    'broken', 'fix', 'stuck', 'trouble', 'confused', 'lost',
  ],
  Technical: [
    'api', 'integrate', 'webhook', 'rest', 'graphql', 'sdk', 'developer',
    'code', 'technical', 'database', 'infrastructure', 'deploy', 'cloud',
    'aws', 'gcp', 'azure', 'server', 'hosting',
  ],
  Booking: [
    'book', 'schedule', 'appointment', 'meeting', 'call', 'demo',
    'talk to', 'speak with', 'consult', 'calendar', 'slot', 'time',
    'available', 'when can', 'set up a',
  ],
  Demo: [
    'demo', 'demonstration', 'show me', 'walkthrough', 'see it in action',
    'trial', 'test drive', 'pilot', 'proof of concept', 'poc',
  ],
  Objection: [
    'too expensive', 'not sure', 'need to think', 'already have',
    'competitor', 'not interested', 'just looking', 'no budget',
    'need approval', 'not the right time', 'maybe later',
    'not ready', 'not a priority',
  ],
  Comparison: [
    'compare', 'versus', 'vs', 'difference', 'better than', 'alternative',
    'competitor', 'instead of', 'switch from', 'replacing', 'similar to',
  ],
  Unknown: [],
};

// ─── Scoring ──────────────────────────────────────────────────────────────────

function scoreIntent(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  let hits = 0;
  for (const kw of keywords) {
    if (lower.includes(kw)) hits++;
  }
  return hits;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Classify the user's intent using keyword scoring.
 * Returns a DetectedIntent with confidence 0–100.
 * Multiple intents can fire simultaneously; the strongest wins.
 */
export function classifyIntent(userMessage: string): DetectedIntent {
  const scores: Partial<Record<IntentType, number>> = {};
  let topScore = 0;

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS) as [IntentType, string[]][]) {
    const score = scoreIntent(userMessage, keywords);
    if (score > 0) scores[intent] = score;
    if (score > topScore) topScore = score;
  }

  if (topScore === 0) {
    return {
      intent:     'Unknown',
      confidence: 20,
      subIntents: [],
      rawText:    userMessage,
    };
  }

  // Primary intent = highest scoring
  const sortedIntents = (Object.entries(scores) as [IntentType, number][])
    .sort((a, b) => b[1] - a[1]);

  const [primaryIntent, primaryScore] = sortedIntents[0];
  const subIntents = sortedIntents.slice(1, 3).map(([i]) => i);

  // Confidence: scale hits relative to keyword count, cap at 95
  const keywordCount = INTENT_KEYWORDS[primaryIntent].length || 1;
  const confidence   = Math.min(95, Math.round((primaryScore / keywordCount) * 100 + 30));

  return {
    intent:     primaryIntent,
    confidence: Math.max(30, confidence),
    subIntents,
    rawText:    userMessage,
  };
}

/**
 * Merge an AI-returned intent string into a DetectedIntent.
 * Called after the LLM validates/overrides the fast-pass classification.
 */
export function mergeAIIntent(
  fast: DetectedIntent,
  aiIntentString: string,
  aiConfidence: number,
): DetectedIntent {
  const trimmed   = aiIntentString.trim() as IntentType;
  const validKeys = Object.keys(INTENT_KEYWORDS) as IntentType[];

  if (!validKeys.includes(trimmed)) return fast;

  return {
    intent:     trimmed,
    confidence: aiConfidence,
    subIntents: fast.subIntents,
    rawText:    fast.rawText,
  };
}

/**
 * Detect booking intent regardless of primary intent classification.
 * Used by the orchestrator to trigger booking handoff.
 */
export function hasBookingIntent(message: string, intent: DetectedIntent): boolean {
  const lower = message.toLowerCase();
  const bookingPhrases = [
    'book', 'schedule', 'set up a call', 'talk to someone',
    'speak with', 'meet with', 'yes please', 'let\'s do it', 'sounds good',
    'i\'d like to', 'i want to', 'sign me up',
  ];
  return (
    intent.intent === 'Booking' ||
    intent.intent === 'Demo' ||
    bookingPhrases.some(p => lower.includes(p))
  );
}
