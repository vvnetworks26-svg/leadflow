/**
 * SafetyService.ts
 *
 * Agent safety layer: prompt injection detection, data leakage prevention,
 * organization boundary enforcement, tool permission validation, output validation.
 */

export interface SafetyCheckResult {
  passed:  boolean;
  reason?: string;
  blocked: boolean;
}

// Prompt injection patterns
const INJECTION_PATTERNS = [
  /ignore (previous|all|above|prior) instructions?/i,
  /you are now/i,
  /pretend (you are|to be)/i,
  /forget (everything|all|prior)/i,
  /disregard (your|all|previous)/i,
  /system (prompt|message)/i,
  /act as (a|an|the)\s+\w/i,
  /\bDAN\b/,
  /<\|im_start\|>/i,
  /\[INST\]/i,
];

// Data leakage patterns — prevent agent from revealing org data to wrong party
const LEAKAGE_PATTERNS = [
  /show me all (leads|customers|users)/i,
  /export (all|every|full)/i,
  /list all (api keys?|tokens?|secrets?|passwords?)/i,
];

// Harmful output patterns
const HARMFUL_OUTPUT = [
  /\b(kill|murder|harm|attack)\s+(the\s+)?user/i,
  /your (api|jwt|secret|private) (key|token) is/i,
];

export const SafetyService = {

  checkInput(input: string, organizationId: string): SafetyCheckResult {
    for (const p of INJECTION_PATTERNS) {
      if (p.test(input)) {
        return { passed: false, blocked: true, reason: 'Prompt injection attempt detected.' };
      }
    }
    for (const p of LEAKAGE_PATTERNS) {
      if (p.test(input)) {
        return { passed: false, blocked: true, reason: 'Request may expose sensitive organizational data.' };
      }
    }
    return { passed: true, blocked: false };
  },

  checkOutput(output: string): SafetyCheckResult {
    for (const p of HARMFUL_OUTPUT) {
      if (p.test(output)) {
        return { passed: false, blocked: true, reason: 'Output contains potentially harmful content.' };
      }
    }
    return { passed: true, blocked: false };
  },

  validateToolPermission(toolName: string, agentTools: Array<{ name: string; enabled: boolean }>): SafetyCheckResult {
    const toolDef = agentTools.find(t => t.name === toolName);
    if (!toolDef) {
      return { passed: false, blocked: true, reason: `Tool '${toolName}' is not registered for this agent.` };
    }
    if (!toolDef.enabled) {
      return { passed: false, blocked: true, reason: `Tool '${toolName}' is disabled for this agent.` };
    }
    return { passed: true, blocked: false };
  },

  enforceOrgBoundary(requestOrgId: string, resourceOrgId: string): SafetyCheckResult {
    if (requestOrgId !== resourceOrgId) {
      return { passed: false, blocked: true, reason: 'Cross-organization data access denied.' };
    }
    return { passed: true, blocked: false };
  },
};
