/**
 * intent-engine/schemas.ts
 *
 * Zod validation schemas for the Intent Understanding Engine.
 * All registry data and configuration passes through these before use.
 */

import { z } from 'zod';

export const IntentCategorySchema = z.enum([
  'book_appointment', 'request_estimate', 'emergency_service',
  'repair', 'installation', 'maintenance', 'inspection', 'warranty',
  'existing_appointment', 'reschedule', 'cancel_appointment',
  'billing_question', 'general_question', 'employment',
  'complaint', 'human_representative', 'other', 'unknown',
]);

export const UrgencyLevelSchema = z.enum(['normal', 'priority', 'emergency', 'critical']);

export const EntityTypeSchema = z.enum([
  'equipment', 'service', 'time', 'address', 'phone', 'name', 'city', 'zip', 'symptom', 'other',
]);

export const IntentKeywordRuleSchema = z.object({
  intent:      IntentCategorySchema,
  subCategory: z.string().default(''),
  keywords:    z.array(z.string().min(1)).min(1),
  phrases:     z.array(z.string().min(1)).default([]),
  weight:      z.number().positive().default(1),
});

export const BlueprintMappingSchema = z.object({
  industry:    z.string().min(1),
  intent:      IntentCategorySchema,
  blueprintId: z.string().min(1),
  priority:    z.number().int().min(0).default(0),
});

export const IntentRegistryConfigSchema = z.object({
  rules:    z.array(IntentKeywordRuleSchema),
  mappings: z.array(BlueprintMappingSchema),
});

export type IntentRegistryConfig = z.infer<typeof IntentRegistryConfigSchema>;
