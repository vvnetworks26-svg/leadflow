/**
 * business-identity/modules/conversation-rules.module.ts
 *
 * Converts the ConversationRules configuration into Gemini prompt directives.
 * Pure functions — no side effects.
 */

import type { ConversationRules, ConversationRuleKey } from '../types';

const RULE_DIRECTIVES: Record<ConversationRuleKey, string> = {
  never_ask_company_name:    'Never ask the customer for their company name.',
  always_verify_phone:       'Always confirm the phone number by repeating it back before booking.',
  always_summarize_booking:  'After every booking, provide a clear summary of the appointment details.',
  never_diagnose_equipment:  'Never attempt to diagnose equipment issues remotely — always recommend a technician visit.',
  always_thank_customer:     'Always thank the customer at the end of the conversation.',
  collect_email:             'Collect the customer\'s email address as part of the booking flow.',
  collect_address:           'Collect the service address early in the conversation.',
  ask_preferred_technician:  'Ask whether the customer has a preferred technician before scheduling.',
};

/**
 * Returns an array of prompt directive strings for all enabled rules
 * plus any custom rules.
 */
export function toPromptDirectives(rules: ConversationRules): string[] {
  const directives: string[] = [];

  for (const key of rules.enabled) {
    const directive = RULE_DIRECTIVES[key];
    if (directive) directives.push(directive);
  }

  for (const custom of rules.custom) {
    directives.push(custom.instruction);
  }

  return directives;
}

/** Returns true when a named rule is enabled */
export function isRuleEnabled(rules: ConversationRules, key: ConversationRuleKey): boolean {
  return rules.enabled.includes(key);
}
