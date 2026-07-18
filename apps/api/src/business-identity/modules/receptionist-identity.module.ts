/**
 * business-identity/modules/receptionist-identity.module.ts
 *
 * Renders the AI receptionist's identity templates.
 * Pure functions — no side effects.
 *
 * Templates support these placeholders:
 *   {aiName}       → identity.aiName
 *   {role}         → identity.role
 *   {businessName} → injected at render time
 */

import type { ReceptionistIdentity } from '../types';

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

export function renderGreeting(
  identity:     ReceptionistIdentity,
  businessName: string,
): string {
  return interpolate(identity.greetingTemplate, {
    aiName:       identity.aiName,
    role:         identity.role,
    businessName,
  });
}

export function renderIntroduction(
  identity:     ReceptionistIdentity,
  businessName: string,
): string {
  return interpolate(identity.introductionTemplate, {
    aiName:       identity.aiName,
    role:         identity.role,
    businessName,
  });
}

export function renderSignOff(
  identity:     ReceptionistIdentity,
  businessName: string,
): string {
  return interpolate(identity.signOffTemplate, {
    aiName:       identity.aiName,
    role:         identity.role,
    businessName,
  });
}
