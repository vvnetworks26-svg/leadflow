/**
 * business-identity/BusinessIdentityFactory.ts
 *
 * Constructs an immutable BusinessIdentity from raw configuration input.
 * Validates all fields via Zod before constructing.
 * Throws ZodError on invalid input — callers must handle.
 *
 * This is the ONLY place a BusinessIdentity is created.
 */

import { BusinessIdentityInputSchema } from './schemas';
import type { BusinessIdentity }       from './types';
import type { BusinessIdentityInput }  from './schemas';

/**
 * Build a validated, frozen BusinessIdentity aggregate.
 *
 * @param raw   - Raw configuration object (e.g. from MongoDB or API)
 * @returns     A readonly BusinessIdentity with loadedAt set to now
 * @throws      ZodError if any field fails validation
 */
export function buildBusinessIdentity(raw: unknown): BusinessIdentity {
  const parsed = BusinessIdentityInputSchema.parse(raw);

  const identity: BusinessIdentity = Object.freeze({
    organizationId:       parsed.organizationId,
    companyProfile:       Object.freeze(parsed.companyProfile),
    contactInfo:          Object.freeze(parsed.contactInfo),
    serviceArea:          Object.freeze({
      ...parsed.serviceArea,
      cities:         Object.freeze([...parsed.serviceArea.cities]),
      counties:       Object.freeze([...parsed.serviceArea.counties]),
      zipCodes:       Object.freeze([...parsed.serviceArea.zipCodes]),
      travelFeeRules: Object.freeze([...parsed.serviceArea.travelFeeRules]),
    }),
    servicesCatalog:      Object.freeze(parsed.servicesCatalog.map(s => Object.freeze(s))),
    businessHours:        Object.freeze({
      ...parsed.businessHours,
      holidays:    Object.freeze([...parsed.businessHours.holidays]),
      closedDates: Object.freeze([...parsed.businessHours.closedDates]),
    }),
    brandPersonality:     Object.freeze(parsed.brandPersonality),
    receptionistIdentity: Object.freeze(parsed.receptionistIdentity),
    conversationRules:    Object.freeze({
      enabled: Object.freeze([...parsed.conversationRules.enabled]),
      custom:  Object.freeze(parsed.conversationRules.custom.map(r => Object.freeze(r))),
    }),
    bookingRules:         Object.freeze(parsed.bookingRules),
    emergencyPolicy:      Object.freeze({
      ...parsed.emergencyPolicy,
      triggers: Object.freeze([...parsed.emergencyPolicy.triggers]),
    }),
    escalationPolicy:     Object.freeze({
      ...parsed.escalationPolicy,
      triggers: Object.freeze([...parsed.escalationPolicy.triggers]),
    }),
    permissions:          Object.freeze({
      allowed: Object.freeze([...parsed.permissions.allowed]),
      denied:  Object.freeze([...parsed.permissions.denied]),
    }),
    integrations:         Object.freeze(parsed.integrations.map(i => Object.freeze(i))),
    businessGoals:        Object.freeze(parsed.businessGoals.map(g => Object.freeze(g))),
    loadedAt:             new Date(),
  });

  return identity;
}

/**
 * Safe parse — returns { success: true, data } or { success: false, error }.
 * Use this when you want to handle validation errors without try/catch.
 */
export function parseBusinessIdentity(
  raw: unknown,
): { success: true; data: BusinessIdentity } | { success: false; error: unknown } {
  try {
    return { success: true, data: buildBusinessIdentity(raw) };
  } catch (error) {
    return { success: false, error };
  }
}
