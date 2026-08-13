import { z } from 'zod';
import { PhoneSchema } from '../business-identity/schemas';

/**
 * Validates only the fields that must satisfy a downstream invariant —
 * not a full Business settings schema. phone may be omitted or an empty
 * string (Business settings are saved progressively, before a phone
 * number is known) but if a non-empty value is sent it must satisfy the
 * exact same bound BusinessIdentityFactory enforces, so a malformed value
 * (e.g. "123") is rejected at the write path instead of silently
 * disabling Layer 3 orchestration later, at read time.
 */
export const UpsertBusinessSchema = z.object({
  phone: z.union([PhoneSchema, z.literal('')]).optional(),
}).passthrough();
