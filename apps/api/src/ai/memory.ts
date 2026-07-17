/**
 * ai/memory.ts  (v2 — Smart Memory Engine)
 *
 * Layered extraction pipeline:
 *   1. Contextual Extraction  — understands replies based on what the AI asked
 *   2. Regex Extraction       — structured patterns (phone, email, etc.)
 *   3. LLM Extraction         — stub; future Gemini fallback
 *   4. Validation             — type coercion + sanity checks
 *   5. Memory Merge           — confidence-gated; never overwrites higher-confidence data
 *
 * Public API is backward-compatible:
 *   - updateMemoryFromMessage()  — same signature, now returns RichConversationMemory
 *   - memoryToPromptBlock()      — unchanged
 *   - getMissingFields()         — unchanged
 *
 * New exports:
 *   - memoryToRich()             — upgrades flat memory to rich
 *   - richToFlat()               — downgrades for serialization / MongoDB
 *   - syncProgressFromMemory()   — recomputes ConversationProgress from rich fields
 */

import type {
  ConversationMemory,
  RichConversationMemory,
  MemoryField,
  ConversationProgress,
} from './types';
import { emptyProgress, emptyRichMemory } from './types';

// ─── Regex patterns ───────────────────────────────────────────────────────────

const PHONE_RE    = /(?:\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/;
const EMAIL_RE    = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;
const BUDGET_RE   = /\$[\d,]+k?(?:\s*[-–]\s*\$[\d,]+k?)?|\d+k?\s*(?:dollars?|usd|budget)/i;
const EMPLOYEE_RE = /\b(\d+(?:\s*[-–]\s*\d+)?)\s*(?:employees?|people|staff|team members?)\b/i;
const ZIP_RE      = /\b\d{5}(?:-\d{4})?\b/;
const NAME_RE     = /(?:i'?m|my name is|this is|call me|i am)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i;
const COMPANY_RE  = /(?:from|at|work(?:ing)?\s+(?:at|for)|company is|we'?re|our company)\s+([A-Z][A-Za-z0-9 &]+?)(?:\s|,|\.|\band\b|$)/;

const TIMELINE_KEYWORDS = [
  'asap', 'immediately', 'right away', 'this week', 'this month',
  'next month', 'q1', 'q2', 'q3', 'q4', 'this quarter', 'next quarter',
  'this year', 'end of year', '30 days', '60 days', '90 days', '6 months',
];

const PAIN_KEYWORDS = [
  'struggling', 'problem', 'issue', 'challenge', 'difficult', 'frustrated',
  'slow', 'manual', 'inefficient', 'losing', 'missing', "can't", 'unable',
  'not working', 'broken', 'outdated', 'expensive', 'too many', 'waste',
  'drop', 'churn', 'fail', 'error', 'complicated', 'confusing',
];

const GOAL_KEYWORDS = [
  'want', 'need', 'looking for', 'trying to', 'goal', 'objective',
  'improve', 'increase', 'reduce', 'automate', 'streamline', 'grow',
  'scale', 'save time', 'save money', 'better', 'faster', 'easier',
];

const OBJECTION_KEYWORDS = [
  'too expensive', "cost too much", "can't afford", 'no budget',
  'need to think', 'not sure', 'need approval', 'talk to my boss',
  'already have', 'using something else', 'competitor',
  'not interested', 'just browsing', 'not ready', 'not right time',
  'too busy', 'no time',
];

const DECISION_MAKER_SIGNALS = [
  'i decide', 'my decision', 'i can approve', "i'm the owner",
  "i'm the ceo", "i'm the founder", 'i manage', 'i run',
];

// ─── Contextual field detector ────────────────────────────────────────────────

/**
 * Maps patterns found in the AI's last message to the field it was asking about.
 * Returns the field key or null if the AI wasn't asking a specific question.
 */
type RichField = keyof RichConversationMemory['rich'];

const CONTEXT_QUESTION_MAP: Array<{ patterns: RegExp[]; field: RichField }> = [
  {
    patterns: [/your\s+name/i, /what'?s\s+your\s+name/i, /may\s+i\s+get\s+your\s+name/i, /can\s+i\s+get\s+your\s+name/i, /first.*name/i],
    field: 'visitorName',
  },
  {
    patterns: [/company/i, /business/i, /organization/i, /firm/i, /who\s+(do\s+you\s+work\s+for|are\s+you\s+with)/i],
    field: 'company',
  },
  {
    patterns: [/phone/i, /number.*reach/i, /reach.*number/i, /call\s+you/i, /contact\s+number/i, /best\s+number/i],
    field: 'phone',
  },
  {
    patterns: [/email/i, /e-mail/i, /email\s+address/i],
    field: 'email',
  },
  {
    patterns: [/address/i, /zip\s*code/i, /zip/i, /location/i, /where\s+(are\s+you|is\s+the\s+property)/i, /service\s+area/i],
    field: 'address',
  },
  {
    patterns: [/service/i, /help.*with/i, /need.*today/i, /issue.*system/i, /problem.*hvac/i, /what.*bring.*here/i, /what.*can.*help/i, /what.*help.*with/i],
    field: 'service',
  },
  {
    patterns: [/emergency/i, /urgent/i, /no\s+heat/i, /no\s+(a\/c|ac|air)/i, /right\s+now/i],
    field: 'emergency',
  },
  {
    patterns: [
      /preferred\s+(day|time)/i,
      /when.*come\s+out/i,
      /day.*work/i,
      /what\s+(day|time).*works?\s+best/i,
      /when\s+works?\s+best/i,
      /which\s+day\s+works?/i,
      /when\s+would\s+you\s+like\s+to\s+schedule/i,
      /when\s+works?\s+best\s+for\s+you/i,
      /today\s+or\s+tomorrow/i,
      /schedule/i,
      /available/i,
      /appointment/i,
    ],
    field: 'preferredTime',
  },
  {
    patterns: [/budget/i, /how\s+much.*spend/i, /investment/i, /price\s+range/i],
    field: 'budget',
  },
  {
    patterns: [/timeline/i, /when.*need/i, /by\s+when/i, /how\s+soon/i, /timeframe/i],
    field: 'timeline',
  },
  {
    patterns: [/employees?/i, /team\s+size/i, /company\s+size/i, /how\s+many\s+people/i, /staff/i],
    field: 'employeeCount',
  },
  {
    patterns: [/industry/i, /sector/i, /type\s+of\s+business/i, /what\s+do\s+you\s+do/i],
    field: 'industry',
  },
];

function detectContextualField(lastAiMessage: string): RichField | null {
  if (!lastAiMessage) return null;
  for (const { patterns, field } of CONTEXT_QUESTION_MAP) {
    if (patterns.some(p => p.test(lastAiMessage))) return field;
  }
  return null;
}

// ─── Value extractors ─────────────────────────────────────────────────────────

function isShortDirectAnswer(text: string): boolean {
  // A direct answer is typically ≤8 words and not itself a question
  return text.trim().split(/\s+/).length <= 8 && !text.trim().endsWith('?');
}

function extractValueForField(field: RichField, text: string): string | boolean | null {
  const trimmed = text.trim();
  switch (field) {
    case 'visitorName': {
      // If it's a short direct answer (likely just their name), use as-is
      if (isShortDirectAnswer(trimmed)) {
        // Clean out common preambles
        const cleaned = trimmed
          .replace(/^(?:i'?m|my name is|this is|call me|it'?s)\s+/i, '')
          .replace(/^(hi|hello|hey),?\s*/i, '');
        // Must look like a name — starts with capital, reasonable length
        if (/^[A-Z][a-zA-Z\s]{1,40}$/.test(cleaned)) return cleaned;
      }
      const m = trimmed.match(NAME_RE);
      return m ? m[1] : null;
    }
    case 'company': {
      if (isShortDirectAnswer(trimmed)) {
        const cleaned = trimmed
          .replace(/^(?:it'?s|we'?re|i work for|i'?m\s+(?:from|at|with)|our company is)\s+/i, '')
          .trim();
        // Reject if the answer looks like a phone number, ZIP code, or employee count
        // (these are numeric answers that belong to other fields)
        const looksNumeric = /^\d[\d\s.\-()]{5,}$/.test(cleaned) ||  // phone-like
                             /^\d{5}(?:-\d{4})?$/.test(cleaned) ||    // ZIP code
                             /^\d{1,5}\s*(?:employees?|people|staff)?$/i.test(cleaned); // employee count
        if (!looksNumeric && cleaned.length >= 2 && cleaned.length <= 60) return cleaned;
      }
      const m = trimmed.match(COMPANY_RE);
      return m ? m[1].trim() : null;
    }
    case 'phone': {
      const m = trimmed.match(PHONE_RE);
      if (m) return m[0].replace(/\D/g, '').replace(/^1/, '');
      return null;
    }
    case 'email': {
      const m = trimmed.match(EMAIL_RE);
      return m ? m[0].toLowerCase() : null;
    }
    case 'address': {
      // ZIP code
      const zipM = trimmed.match(ZIP_RE);
      if (zipM) return zipM[0];
      // Short answer likely is the address
      if (isShortDirectAnswer(trimmed) && trimmed.length > 3) return trimmed;
      return null;
    }
    case 'zip': {
      const m = trimmed.match(ZIP_RE);
      return m ? m[0] : null;
    }
    case 'service': {
      if (isShortDirectAnswer(trimmed)) return trimmed;
      return trimmed.length > 3 ? trimmed.substring(0, 120) : null;
    }
    case 'emergency': {
      const lower = trimmed.toLowerCase();
      // Negative check first — only match when the denial is the primary sentiment
      // Use start-of-string anchors or standalone-word checks to avoid
      // matching "no heat" (which is an emergency indicator) as a negation.
      const negativePattern = /^(no|nope|not really|nah)\b(?!\s+heat|\s+a\/c|\s+ac|\s+air|\s+power|\s+cool)/;
      const explicitNegative = /\bnot\s+(urgent|an?\s+emergency|really\s+urgent)\b/;
      if (negativePattern.test(lower) || explicitNegative.test(lower)) return false;
      if (/\b(yes|yeah|yep|absolutely|definitely|urgent|emergency|asap)\b/.test(lower)) return true;
      return null;
    }
    case 'preferredTime': {
      // Accept short direct answers ("Tomorrow", "Monday") and
      // common time phrases that may exceed 8 words
      const lower = trimmed.toLowerCase();
      const timePhrasesRE = /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|afternoon|evening|weekend|anytime|after\s+\d|at\s+\d|am\b|pm\b|\d+\s*(am|pm))\b/i;
      if (isShortDirectAnswer(trimmed)) return trimmed;
      if (timePhrasesRE.test(lower) && trimmed.length <= 60) return trimmed;
      return null;
    }
    case 'budget': {
      const m = trimmed.match(BUDGET_RE);
      if (m) return m[0];
      if (isShortDirectAnswer(trimmed) && /\d/.test(trimmed)) return trimmed;
      return null;
    }
    case 'timeline': {
      const lower = trimmed.toLowerCase();
      for (const kw of TIMELINE_KEYWORDS) {
        if (lower.includes(kw)) return kw;
      }
      if (isShortDirectAnswer(trimmed)) return trimmed;
      return null;
    }
    case 'employeeCount': {
      const m = trimmed.match(EMPLOYEE_RE);
      if (m) return m[1];
      if (/^\d+$/.test(trimmed.trim())) return trimmed.trim();
      return null;
    }
    case 'industry': {
      if (isShortDirectAnswer(trimmed)) return trimmed;
      return null;
    }
    default:
      return null;
  }
}

// ─── Layered extraction ───────────────────────────────────────────────────────

/**
 * Layer 1: Contextual extraction.
 * If the AI's last message was asking about a specific field, treat the
 * user's reply as the answer to that field (high confidence).
 */
function contextualExtract(
  userMessage: string,
  lastAiMessage: string | undefined,
): Partial<Record<RichField, MemoryField<any>>> {
  if (!lastAiMessage) return {};

  const field = detectContextualField(lastAiMessage);
  if (!field) return {};

  const value = extractValueForField(field, userMessage);
  if (value === null) return {};

  return {
    [field]: { value, confidence: 90, source: 'context' as const },
  };
}

/**
 * Layer 2: Regex extraction.
 * Scans the whole message for structured patterns regardless of context.
 * Only used for fields not already captured contextually.
 */
function regexExtract(
  userMessage: string,
): Partial<Record<RichField, MemoryField<any>>> {
  const result: Partial<Record<RichField, MemoryField<any>>> = {};

  const phone = userMessage.match(PHONE_RE);
  if (phone) {
    result.phone = { value: phone[0].replace(/\D/g, '').replace(/^1/, ''), confidence: 78, source: 'regex' };
  }

  const email = userMessage.match(EMAIL_RE);
  if (email) {
    result.email = { value: email[0].toLowerCase(), confidence: 82, source: 'regex' };
  }

  const budget = userMessage.match(BUDGET_RE);
  if (budget) {
    result.budget = { value: budget[0], confidence: 75, source: 'regex' };
  }

  const zip = userMessage.match(ZIP_RE);
  if (zip) {
    result.zip     = { value: zip[0], confidence: 80, source: 'regex' };
    result.address = { value: zip[0], confidence: 70, source: 'regex' };
  }

  const emp = userMessage.match(EMPLOYEE_RE);
  if (emp) {
    result.employeeCount = { value: emp[1], confidence: 75, source: 'regex' };
  }

  const nameM = userMessage.match(NAME_RE);
  if (nameM) {
    result.visitorName = { value: nameM[1].trim(), confidence: 80, source: 'regex' };
  }

  const companyM = userMessage.match(COMPANY_RE);
  if (companyM) {
    result.company = { value: companyM[1].trim(), confidence: 72, source: 'regex' };
  }

  return result;
}

// ─── Memory merge engine ──────────────────────────────────────────────────────

/**
 * Merge a new field value into an existing field.
 * Only updates if the incoming confidence EXCEEDS the existing confidence.
 * Null incoming values never overwrite existing data.
 */
function mergeRichField<T>(
  existing: MemoryField<T>,
  incoming: MemoryField<T>,
): MemoryField<T> {
  if (incoming.value === null || incoming.value === undefined) return existing;
  if (existing.value !== null && incoming.confidence <= existing.confidence) return existing;
  return incoming;
}

// ─── Progress sync ────────────────────────────────────────────────────────────

export function syncProgressFromMemory(memory: RichConversationMemory): ConversationProgress {
  const r = memory.rich;
  return {
    visitorNameCollected: r.visitorName.value !== null,
    companyCollected:     r.company.value !== null,
    phoneCollected:       r.phone.value !== null,
    emailCollected:       r.email.value !== null,
    addressCollected:     r.address.value !== null || r.zip.value !== null,
    painCollected:        memory.painPoints.length > 0,
    budgetCollected:      r.budget.value !== null,
    timelineCollected:    r.timeline.value !== null,
    appointmentCollected: r.preferredTime.value !== null,
    serviceCollected:     r.service.value !== null || memory.servicesDiscussed.length > 0,
    emergencyCollected:   r.emergency.value !== null,
  };
}

// ─── Upgrade / downgrade helpers ─────────────────────────────────────────────

/**
 * Upgrades a flat ConversationMemory to RichConversationMemory.
 * Existing flat values are imported with a baseline confidence of 60
 * (they were collected before v2 but without provenance tracking).
 */
export function memoryToRich(memory: ConversationMemory): RichConversationMemory {
  // If already rich, return as-is (with progress re-sync)
  if ('rich' in memory && (memory as RichConversationMemory).rich) {
    const rich = memory as RichConversationMemory;
    rich.progress = syncProgressFromMemory(rich);
    return rich;
  }

  const f = <T = string>(v: T | null, conf = 60): MemoryField<T> =>
    v !== null ? { value: v, confidence: conf, source: 'user' as const } : { value: null, confidence: 0, source: null };

  const rich: RichConversationMemory = {
    ...memory,
    rich: {
      visitorName:   f(memory.visitorName),
      company:       f(memory.company),
      phone:         f(memory.phone),
      email:         f(memory.email),
      address:       f(memory.location),
      zip:           f<string>(null),
      industry:      f(memory.industry),
      employeeCount: f(memory.employeeCount),
      budget:        f(memory.budget),
      timeline:      f(memory.timeline),
      service:       f(memory.servicesDiscussed[0] ?? null),
      emergency:     f<boolean>(null),
      preferredTime: f<string>(null),
    },
    progress: emptyProgress(),
  };
  rich.progress = syncProgressFromMemory(rich);
  return rich;
}

/**
 * Downgrades a RichConversationMemory to the flat ConversationMemory
 * for serialization / MongoDB storage.
 * Flat fields are synced from the rich fields' values.
 */
export function richToFlat(rich: RichConversationMemory): ConversationMemory {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { rich: _r, progress: _p, ...flat } = rich as any;
  return flat as ConversationMemory;
}

// ─── Array extractors (unchanged logic, moved here) ───────────────────────────

function extractPainPoints(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const kw of PAIN_KEYWORDS) {
    if (lower.includes(kw)) {
      const sentence = text.split(/[.!?]/).find(s => s.toLowerCase().includes(kw));
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
      const sentence = text.split(/[.!?]/).find(s => s.toLowerCase().includes(kw));
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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Main entry point for the memory engine.
 *
 * Pipeline:
 *   1. Upgrade incoming memory to RichConversationMemory
 *   2. Run contextual extraction against (userMessage, lastAiMessage)
 *   3. Run regex extraction for any fields not covered contextually
 *   4. Merge extractions into rich memory using confidence rules
 *   5. Sync flat fields from rich.*.value
 *   6. Recompute progress
 *   7. Update arrays (pain points, goals, objections)
 *
 * Returns RichConversationMemory which is also a valid ConversationMemory
 * (backward compatible — callers that only read flat fields still work).
 */
export function updateMemoryFromMessage(
  memory:   ConversationMemory,
  message:  string,
  lastAiMessage?: string,
): RichConversationMemory {
  const rich = memoryToRich(memory);

  // ── Layer 1: contextual ──────────────────────────────────────────────────
  const contextual = contextualExtract(message, lastAiMessage);

  // ── Layer 2: regex (only for fields not captured contextually) ───────────
  const regex = regexExtract(message);

  // ── Merge into rich fields ────────────────────────────────────────────────
  for (const _field of Object.keys(rich.rich) as RichField[]) {
    const field = _field as RichField;
    const contextVal = contextual[field];
    const regexVal   = regex[field];

    if (contextVal) {
      (rich.rich as any)[field] = mergeRichField((rich.rich as any)[field], contextVal);
    } else if (regexVal) {
      (rich.rich as any)[field] = mergeRichField((rich.rich as any)[field], regexVal);
    }
  }

  // ── Sync flat fields from rich values ─────────────────────────────────────
  if (rich.rich.visitorName.value)   rich.visitorName   = rich.rich.visitorName.value;
  if (rich.rich.company.value)       rich.company       = rich.rich.company.value;
  if (rich.rich.phone.value)         rich.phone         = rich.rich.phone.value;
  if (rich.rich.email.value)         rich.email         = rich.rich.email.value;
  if (rich.rich.address.value)       rich.location      = rich.rich.address.value;
  if (rich.rich.zip.value)           rich.location      = rich.location ?? rich.rich.zip.value;
  if (rich.rich.industry.value)      rich.industry      = rich.rich.industry.value;
  if (rich.rich.employeeCount.value) rich.employeeCount = rich.rich.employeeCount.value;
  if (rich.rich.budget.value)        rich.budget        = rich.rich.budget.value;
  if (rich.rich.timeline.value)      rich.timeline      = rich.rich.timeline.value;

  // Track service in servicesDiscussed array
  if (rich.rich.service.value && !rich.servicesDiscussed.includes(rich.rich.service.value)) {
    rich.servicesDiscussed = [...rich.servicesDiscussed, rich.rich.service.value];
  }

  // ── Arrays ────────────────────────────────────────────────────────────────
  const newPains      = extractPainPoints(message);
  const newGoals      = extractGoals(message);
  const newObjections = extractObjections(message);

  rich.painPoints  = [...new Set([...rich.painPoints,  ...newPains])];
  rich.goals       = [...new Set([...rich.goals,       ...newGoals])];
  rich.objections  = [...new Set([...rich.objections,  ...newObjections])];

  if (rich.decisionMaker === null) {
    const dm = detectDecisionMaker(message);
    if (dm !== null) rich.decisionMaker = dm;
  }

  // Track answered questions (AI asked something, user responded)
  if (lastAiMessage && message.length > 2) {
    const questionMatch = lastAiMessage.match(/[^.!?]*\?/);
    if (questionMatch) {
      const q = questionMatch[0].trim().slice(0, 80);
      if (!rich.questionsAnswered.includes(q)) {
        rich.questionsAnswered = [...rich.questionsAnswered, q];
      }
    }
  }

  // ── Recompute progress ────────────────────────────────────────────────────
  rich.progress    = syncProgressFromMemory(rich);
  rich.lastUpdated = new Date().toISOString();

  return rich;
}

/**
 * Build a concise memory block for injection into the system prompt.
 * Only includes populated fields — no noise.
 */
export function memoryToPromptBlock(memory: ConversationMemory): string {
  const lines: string[] = ['[CONVERSATION MEMORY]'];

  if (memory.visitorName)   lines.push(`Visitor name: ${memory.visitorName}`);
  if (memory.company)       lines.push(`Company: ${memory.company}`);
  if (memory.industry)      lines.push(`Industry: ${memory.industry}`);
  if (memory.location)      lines.push(`Location: ${memory.location}`);
  if (memory.employeeCount) lines.push(`Employee count: ${memory.employeeCount}`);
  if (memory.decisionMaker !== null) {
    lines.push(`Decision maker: ${memory.decisionMaker ? 'Yes' : 'No/Unknown'}`);
  }
  if (memory.budget)   lines.push(`Budget: ${memory.budget}`);
  if (memory.timeline) lines.push(`Timeline: ${memory.timeline}`);
  if (memory.phone)    lines.push(`Phone: ${memory.phone}`);
  if (memory.email)    lines.push(`Email: ${memory.email}`);

  // Rich fields not reflected in flat memory
  const r = (memory as RichConversationMemory).rich;
  if (r?.service?.value)       lines.push(`Service requested: ${r.service.value}`);
  if (r?.emergency?.value !== null && r?.emergency?.value !== undefined) {
    lines.push(`Emergency: ${r.emergency.value ? 'Yes' : 'No'}`);
  }
  if (r?.preferredTime?.value) lines.push(`Preferred appointment time: ${r.preferredTime.value}`);

  if (memory.painPoints.length > 0)  lines.push(`Pain points: ${memory.painPoints.join('; ')}`);
  if (memory.goals.length > 0)       lines.push(`Goals: ${memory.goals.join('; ')}`);
  if (memory.servicesDiscussed.length > 0) {
    lines.push(`Services discussed: ${memory.servicesDiscussed.join(', ')}`);
  }
  if (memory.objections.length > 0)  lines.push(`Objections raised: ${memory.objections.join('; ')}`);
  if (memory.bookingStatus !== 'none') lines.push(`Booking status: ${memory.bookingStatus}`);
  if (memory.demoRequested)           lines.push(`Demo requested: Yes`);
  if (memory.summary)                 lines.push(`Conversation summary: ${memory.summary}`);

  lines.push('[/CONVERSATION MEMORY]');
  return lines.join('\n');
}

/**
 * Return fields still unknown — used to guide the AI toward collecting
 * missing qualification data. Unchanged API for backward compatibility.
 */
export function getMissingFields(memory: ConversationMemory): string[] {
  const missing: string[] = [];
  if (!memory.visitorName)               missing.push('visitor name');
  if (!memory.company)                   missing.push('company name');
  if (!memory.industry)                  missing.push('industry');
  if (!memory.employeeCount)             missing.push('company size');
  if (memory.decisionMaker === null)     missing.push('decision-making authority');
  if (!memory.budget)                    missing.push('budget range');
  if (!memory.timeline)                  missing.push('implementation timeline');
  if (memory.painPoints.length === 0)    missing.push('pain points');
  if (!memory.phone && !memory.email)    missing.push('contact information');
  return missing;
}
