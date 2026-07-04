/**
 * configuration/defaults.ts
 *
 * Layer 1 — SDK internal defaults.
 * Every configuration field has a default here.
 * No magic values anywhere else in the SDK.
 *
 * Rules:
 *   - This file has zero imports from other SDK modules (no circular risk).
 *   - Values must match the types declared in types.ts.
 *   - Adding a new config field: add its default here first.
 */

import type { WidgetConfig } from '../types';

/**
 * The complete set of SDK defaults.
 * Used as Layer 1 in the resolution pipeline.
 * Frozen at module load — cannot be mutated at runtime.
 */
export const CONFIG_DEFAULTS: Readonly<Omit<WidgetConfig, 'businessId'>> = Object.freeze({
  position:     'bottom-right' as const,
  theme:        'auto'         as const,
  primaryColor: '#6366f1',
});

/**
 * Build a full WidgetConfig by merging supplied values onto CONFIG_DEFAULTS.
 * The businessId must always be supplied — it has no sensible default.
 */
export function applyDefaults(
  partial: Partial<WidgetConfig> & { businessId: string }
): WidgetConfig {
  return {
    businessId:   partial.businessId,
    position:     partial.position     ?? CONFIG_DEFAULTS.position,
    theme:        partial.theme        ?? CONFIG_DEFAULTS.theme,
    primaryColor: partial.primaryColor ?? CONFIG_DEFAULTS.primaryColor,
  };
}
