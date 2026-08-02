/**
 * response-engine/Personalization.ts
 *
 * Extracts personalization fields from memory.
 * Never invents values. If not in memory → undefined.
 * Pure function. No side effects.
 */

import type { ResponseBlueprint } from './types';
import type { RichConversationMemory } from '../ai/types';

export function buildPersonalization(
  memory: RichConversationMemory,
): ResponseBlueprint['personalization'] {
  const name    = memory.visitorName                ?? memory.rich?.visitorName?.value ?? undefined;
  const company = memory.company                    ?? memory.rich?.company?.value     ?? undefined;
  const service = memory.servicesDiscussed?.[0]     ?? memory.rich?.service?.value     ?? undefined;

  return Object.freeze({
    visitorName: name    || undefined,
    company:     company || undefined,
    service:     service || undefined,
  });
}
