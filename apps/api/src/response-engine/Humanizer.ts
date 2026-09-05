/**
 * response-engine/Humanizer.ts
 *
 * Transformation helpers that convert robotic phrasing to natural language.
 * NO AI. NO LLM. Pure deterministic string transformations.
 *
 * These helpers are used by ResponsePlanner to populate the `question` field
 * in the ResponseBlueprint. Gemini later decides exact wording — these
 * templates are fallback-quality guidance, not final output.
 */

// ─── Field question humanizer ─────────────────────────────────────────────────

const FIELD_QUESTIONS: Record<string, string[]> = {
  visitorName:   [
    "What's your name?",
    "Can I get your name?",
    "Who am I speaking with?",
    "First, what's your name?",
  ],
  phone: [
    "What's the best number to reach you?",
    "What phone number can our technician call you on?",
    "What's a good number for you?",
    "What number should we use to confirm your appointment?",
  ],
  address: [
    "What's the service address?",
    "What address should we send the technician to?",
    "What ZIP code are you in?",
    "What's the address we'd be coming out to?",
  ],
  email: [
    "What's the best email to send your confirmation to?",
    "Can I get an email address for you?",
    "What email should we use?",
  ],
  service: [
    "What service do you need today?",
    "What's going on with your system?",
    "What can we help you with?",
    "What's the issue you're experiencing?",
  ],
  emergency: [
    "Is this an emergency — like no heat or no A/C?",
    "Would you say this is urgent?",
    "Is this an emergency situation?",
  ],
  budget: [
    "Do you have a budget range in mind?",
    "What kind of investment are you looking at?",
    "Is there a budget you're working with?",
  ],
  timeline: [
    "When are you looking to get started?",
    "What's your timeline for this?",
    "How soon do you need this taken care of?",
  ],
  preferredTime: [
    "What day works best for you?",
    "When would you like us to come out?",
    "Do you have a preferred day or time?",
    "Would tomorrow work, or do you have a specific day in mind?",
  ],
};

/**
 * Returns a natural-language question for a given field name.
 * @param field  - the field key (e.g. 'phone', 'address')
 * @param index  - rotation index (use turnCount to vary phrasing)
 */
export function humanizeFieldQuestion(field: string, index = 0): string {
  const variants = FIELD_QUESTIONS[field];
  if (!variants || variants.length === 0) return '';
  return variants[index % variants.length];
}

// ─── Robotic → Natural phrase rewriter (lookup table) ────────────────────────

const ROBOTIC_MAP: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /please provide your phone number\.?/i,           replacement: "What's the best number to reach you on?" },
  { pattern: /please provide your address\.?/i,                replacement: "What's the service address?" },
  { pattern: /please provide your name\.?/i,                   replacement: "What's your name?" },
  { pattern: /please provide your email(?: address)?\.?/i,     replacement: "What email should we send your confirmation to?" },
  { pattern: /what is your name\?/i,                           replacement: "What's your name?" },
  { pattern: /what is your phone number\?/i,                   replacement: "What's the best number to reach you?" },
  { pattern: /what is your address\?/i,                        replacement: "What's your address?" },
  { pattern: /provide your (phone|number)\.?/i,                replacement: "What's a good number for you?" },
  { pattern: /provide your address\.?/i,                       replacement: "What's the service address?" },
  { pattern: /enter your (phone|number)\.?/i,                  replacement: "What number can we reach you at?" },
  { pattern: /your visitor name\.?/i,                          replacement: "your name" },
];

/**
 * Applies deterministic phrase replacements to make a string sound more natural.
 * Does not change content — only replaces known robotic patterns.
 */
export function humanize(text: string): string {
  let result = text;
  for (const { pattern, replacement } of ROBOTIC_MAP) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// ─── Greeting personalizer ────────────────────────────────────────────────────

/**
 * Injects a visitor's name into a greeting template when available.
 * Template tokens: {name}, {service}, {company}
 */
export function personalizeGreeting(
  template: string,
  vars: { name?: string; service?: string; company?: string },
): string {
  return template
    .replace('{name}',    vars.name    ?? 'there')
    .replace('{service}', vars.service ?? 'your service')
    .replace('{company}', vars.company ?? 'your company');
}

// ─── mustMention builder ──────────────────────────────────────────────────────

/**
 * Builds the list of facts Gemini must include in its response.
 * Based on the active objective and available memory.
 */
export function buildMustMention(params: {
  objective:     string;
  visitorName?:  string;
  service?:      string;
  businessName:  string;
  isEmergency:   boolean;
  bookingStatus?:'none' | 'requested' | 'booked';
}): string[] {
  const items: string[] = [];

  if (params.visitorName) items.push(`Address the customer as ${params.visitorName}`);
  if (params.isEmergency)  items.push('Acknowledge the urgency immediately');
  if (params.service)      items.push(`Reference the service: ${params.service}`);

  // 'Confirm the booking' / 'Confirm the appointment details clearly' used to
  // be unconditional here — a direct instruction to claim success, issued
  // regardless of whether widgetBook() had actually run. That directly
  // contradicted the universal guardrail 'Never fabricate appointment
  // confirmations' (prompt-assembly/GuardrailSerializer.ts) with a more
  // specific, later instruction the model followed instead. Gated on the
  // same bookingStatus === 'booked' signal used everywhere else this is
  // checked (ToolGuards.ts, CTAEngine.ts, completion-evaluator.ts).
  const isBooked = params.bookingStatus === 'booked';

  const objectiveMentions: Record<string, string[]> = {
    offer_appointment:   isBooked
      ? ['Mention available appointment times', 'Confirm the booking']
      : ['Mention available appointment times', 'Do NOT say the appointment is booked or confirmed yet — no time has been selected'],
    confirm_appointment: isBooked
      ? ['Confirm the appointment details clearly', 'Include confirmation steps']
      : ['Say you are pulling up real scheduling options', 'Do NOT say the appointment is booked, confirmed, or scheduled — nothing has been booked yet'],
    complete_conversation:['Thank the customer', `Mention ${params.businessName} will follow up`],
    escalate_to_human:   ['Assure the customer a human will assist shortly'],
    resolve_objection:   ['Acknowledge the concern before reframing'],
    provide_estimate:    ['Mention the estimate will be based on the service details provided'],
  };

  const extra = objectiveMentions[params.objective] ?? [];
  items.push(...extra);

  return items;
}

// ─── mustAvoid builder ────────────────────────────────────────────────────────

/**
 * Builds the list of phrases and topics Gemini must avoid.
 * Universal guardrails plus objective-specific ones.
 */
export function buildMustAvoid(params: {
  objective: string;
  industry:  string;
}): string[] {
  const universal = [
    'Never claim to be human',
    'Never invent pricing not in the knowledge base',
    'Never promise specific arrival times',
    'Never diagnose equipment remotely',
    'Never provide legal or medical advice',
  ];

  const objectiveAvoid: Record<string, string[]> = {
    handle_emergency:   ['Do not ask unnecessary questions', 'Do not delay action with small talk'],
    resolve_objection:  ['Do not be dismissive', 'Do not use pressure tactics'],
    escalate_to_human:  ['Do not attempt to resolve the issue yourself'],
    provide_estimate:   ['Do not give a specific price without qualifiers'],
  };

  return [...universal, ...(objectiveAvoid[params.objective] ?? [])];
}
