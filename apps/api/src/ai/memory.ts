/**
 * ai/memory.ts
 *
 * Structured conversation memory manager.
 * Extracts and merges new information from each AI turn into the
 * persistent ConversationMemory object.
 *
 * The AI never asks for information that's already been collected.
 * Memory is stored in the ConversationSession document and passed
 * to the prompt builder on every turn.
 */

import type { ConversationMemory } from './types';

// ─── Extraction patterns ──────────────────────────────────────────────────────

const PHONE_RE   = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
const EMAIL_RE   = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;
const BUDGET_RE  = /\$[\d,]+k?(?:\s*-\s*\$[\d,]+k?)?|\d+k?\s*(?:dollars?|usd|budget)/i;
const EMPLOYEE_RE = /\b(\d+(?:\s*-\s*\d+)?)\s*(?:employees?|people|staff|team members?)\b/i;

const TIMELINE_KEYWORDS = [
  'asap', 'immediately', 'right away', 'this week', 'this month',
  'next month', 'q1', 'q2', 'q3', 'q4', 'this quarter', 'next quarter',
  'this year', 'end of year', '30 days', '60 days', '90 days', '6 months',
];

const PAIN_KEYWORDS = [
  'struggling', 'problem', 'issue', 'challenge', 'difficult', 'frustrated',
  'slow', 'manual', 'inefficient', 'losing', 'missing', 'can\'t', 'unable',
  'not working', 'broken', 'outdated', 'expensive', 'too many', 'waste',
  'drop', 'churn', 'fail', 'error', 'complicated', 'confusing',
];

const GOAL_KEYWORDS = [
  'want', 'need', 'looking for', 'trying to', 'goal', 'objective',
  'improve', 'increase', 'reduce', 'automate', 'streamline', 'grow',
  'scale', 'save time', 'save money', 'better', 'faster', 'easier',
];

const OBJECTION_KEYWORDS = [
  'too expensive', 'cost too much', 'can\'t afford', 'no budget',
  'need to think', 'not sure', 'need approval', 'talk to my boss',
  'already have', 'using something else', 'competitor',
  'not interested', 'just browsing', 'not ready', 'not right time',
  'too busy', 'no time',
];

const DECISION_MAKER_SIGNALS = [
  'i decide', 'my decision', 'i can approve', 'i\'m the owner',
  'i\'m the ceo', 'i\'m the founder', 'i manage', 'i run',
];

// ─── Extraction helpers ───────────────────────────────────────────────────────

function extractPhone(text: string): string | null {
  const m = text.match(PHONE_RE);
  return m ? m[0].replace(/\D/g, '').replace(/^1/, '') : null;
}

function extractEmail(text: string): string | null {
  const m = text.match(EMAIL_RE);
  return m ? m[0].toLowerCase() : null;
}

function extractBudget(text: string): string | null {
  const m = text.match(BUDGET_RE);
  return m ? m[0] : null;
}

function extractEmployeeCount(text: string): string | null {
  const m = text.match(EMPLOYEE_RE);
  return m ? m[1] : null;
}

function extractTimeline(text: string): string | null {
  const lower = text.toLowerCase();
  for (const kw of TIMELINE_KEYWORDS) {
    if (lower.includes(kw)) return kw;
  }
  return null;
}

function extractPainPoints(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const kw of PAIN_KEYWORDS) {
    if (lower.includes(kw)) {
      // Extract the sentence containing the keyword
      const sentences = text.split(/[.!?]/);
      const sentence  = sentences.find(s => s.toLowerCase().includes(kw));
      if (sentence) found.push(sentence.trim());
    }
  }
  return [...new Set(found)].slice(0, 3);
}

function extractGoals(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const kw of GOAL_KEYWORDS) {
    if (lower.includes(kw)) {
      const sentences = text.split(/[.!?]/);
      const sentence  = sentences.find(s => s.toLowerCase().includes(kw));
      if (sentence) found.push(sentence.trim());
    }
  }
  return [...new Set(found)].slice(0, 3);
}

function extractObjections(text: string): string[] {
  const lower = text.toLowerCase();
  return OBJECTION_KEYWORDS.filter(kw => lower.includes(kw)).slice(0, 3);
}

function detectDecisionMaker(text: string): boolean | null {
  const lower = text.toLowerCase();
  for (const signal of DECISION_MAKER_SIGNALS) {
    if (lower.includes(signal)) return true;
  }
  return null;
}

function extractName(text: string): string | null {
  // Common patterns: "I'm John", "my name is Jane", "this is Mike"
  const m = text.match(
    /(?:i'?m|my name is|this is|call me|i am)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i
  );
  return m ? m[1].trim() : null;
}

function extractCompany(text: string): string | null {
  const m = text.match(
    /(?:from|at|work(?:ing)? (?:at|for)|company is|we're|our company)\s+([A-Z][A-Za-z0-9 &]+?)(?:\s|,|\.|\band\b|$)/
  );
  return m ? m[1].trim() : null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Merge new signals extracted from a user message into existing memory.
 * Only fills in null/empty slots — never overwrites known values.
 */
export function updateMemoryFromMessage(
  memory:   ConversationMemory,
  message:  string,
  aiReply?: string,
): ConversationMemory {
  const text    = message;
  const updated = { ...memory, lastUpdated: new Date().toISOString() };

  // Identity
  if (!updated.visitorName) updated.visitorName = extractName(text);
  if (!updated.company)     updated.company     = extractCompany(text);
  if (!updated.phone)       updated.phone       = extractPhone(text);
  if (!updated.email)       updated.email       = extractEmail(text);

  // Commercial signals
  if (!updated.budget)        updated.budget        = extractBudget(text);
  if (!updated.timeline)      updated.timeline      = extractTimeline(text);
  if (!updated.employeeCount) updated.employeeCount = extractEmployeeCount(text);
  if (updated.decisionMaker === null) {
    const dm = detectDecisionMaker(text);
    if (dm !== null) updated.decisionMaker = dm;
  }

  // Arrays — merge unique values
  const newPains      = extractPainPoints(text);
  const newGoals      = extractGoals(text);
  const newObjections = extractObjections(text);

  updated.painPoints  = [...new Set([...updated.painPoints,  ...newPains])];
  updated.goals       = [...new Set([...updated.goals,       ...newGoals])];
  updated.objections  = [...new Set([...updated.objections,  ...newObjections])];

  // Track questions answered — if AI asked something and user responded
  if (aiReply && text.length > 2) {
    // Extract the AI question and mark it answered
    const questionMatch = aiReply.match(/[^.!?]*\?/);
    if (questionMatch) {
      const q = questionMatch[0].trim().slice(0, 80);
      if (!updated.questionsAnswered.includes(q)) {
        updated.questionsAnswered = [...updated.questionsAnswered, q];
      }
    }
  }

  return updated;
}

/**
 * Build a concise memory summary for injection into the system prompt.
 * Only includes fields that have been populated.
 */
export function memoryToPromptBlock(memory: ConversationMemory): string {
  const lines: string[] = ['[CONVERSATION MEMORY]'];

  if (memory.visitorName)    lines.push(`Visitor name: ${memory.visitorName}`);
  if (memory.company)        lines.push(`Company: ${memory.company}`);
  if (memory.industry)       lines.push(`Industry: ${memory.industry}`);
  if (memory.location)       lines.push(`Location: ${memory.location}`);
  if (memory.employeeCount)  lines.push(`Employee count: ${memory.employeeCount}`);
  if (memory.decisionMaker !== null) {
    lines.push(`Decision maker: ${memory.decisionMaker ? 'Yes' : 'No/Unknown'}`);
  }
  if (memory.budget)         lines.push(`Budget: ${memory.budget}`);
  if (memory.timeline)       lines.push(`Timeline: ${memory.timeline}`);
  if (memory.phone)          lines.push(`Phone: ${memory.phone}`);
  if (memory.email)          lines.push(`Email: ${memory.email}`);

  if (memory.painPoints.length > 0) {
    lines.push(`Pain points: ${memory.painPoints.join('; ')}`);
  }
  if (memory.goals.length > 0) {
    lines.push(`Goals: ${memory.goals.join('; ')}`);
  }
  if (memory.servicesDiscussed.length > 0) {
    lines.push(`Services discussed: ${memory.servicesDiscussed.join(', ')}`);
  }
  if (memory.objections.length > 0) {
    lines.push(`Objections raised: ${memory.objections.join('; ')}`);
  }
  if (memory.bookingStatus !== 'none') {
    lines.push(`Booking status: ${memory.bookingStatus}`);
  }
  if (memory.demoRequested) {
    lines.push(`Demo requested: Yes`);
  }
  if (memory.summary) {
    lines.push(`Conversation summary: ${memory.summary}`);
  }

  lines.push('[/CONVERSATION MEMORY]');
  return lines.join('\n');
}

/**
 * Return a list of fields that are still unknown — used to guide
 * the AI toward collecting missing qualification data.
 */
export function getMissingFields(memory: ConversationMemory): string[] {
  const missing: string[] = [];
  if (!memory.visitorName)                     missing.push('visitor name');
  if (!memory.company)                         missing.push('company name');
  if (!memory.industry)                        missing.push('industry');
  if (!memory.employeeCount)                   missing.push('company size');
  if (memory.decisionMaker === null)           missing.push('decision-making authority');
  if (!memory.budget)                          missing.push('budget range');
  if (!memory.timeline)                        missing.push('implementation timeline');
  if (memory.painPoints.length === 0)          missing.push('pain points');
  if (!memory.phone && !memory.email)          missing.push('contact information');
  return missing;
}
