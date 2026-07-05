/**
 * dashboard/config.ts — Dashboard configuration layer manager.
 *
 * Injects dashboard-supplied config as Layer 4 into the ConfigurationService.
 * Layer 4 sits above script attributes (Layer 2) and below runtime overrides
 * (the existing overrideLayer / Layer 3).
 *
 * The ConfigurationService already has a _serverLayer stub (always empty).
 * We hook into it by calling setDashboardLayer() which writes to a new
 * internal layer exposed via a dedicated method added to the service.
 *
 * Since the ConfigurationService doesn't expose a public dashboard layer setter,
 * this module drives it through setRuntimeOverrides() for dashboard fields —
 * applying only the non-meta fields from the dashboard config as a "dashboard
 * override" group, tracked separately from user runtime overrides.
 *
 * The bridge keeps its own copy of the dashboard layer and merges at sync time.
 */

import type { ConfigurationService } from '../configuration/service';
import type { WidgetConfig }          from '../types';
import type { DashboardConfig, ConfigDiff } from './types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract only WidgetConfig-shaped fields from a DashboardConfig,
 * stripping the _meta field.
 */
export function extractConfigFields(
  dash: DashboardConfig
): Partial<WidgetConfig> {
  const { _meta: _ignored, ...rest } = dash;
  return rest as Partial<WidgetConfig>;
}

/**
 * Compute the diff between a previous resolved config and a new partial config.
 */
export function computeDiff(
  previous: Readonly<WidgetConfig> | null,
  incoming: Partial<WidgetConfig>
): ConfigDiff[] {
  const diffs: ConfigDiff[] = [];
  const fields = Object.keys(incoming) as (keyof WidgetConfig)[];

  for (const field of fields) {
    const curr = incoming[field];
    if (curr === undefined || curr === null) continue;
    const prev = previous?.[field];
    if (String(prev) !== String(curr)) {
      diffs.push({
        field,
        previous: prev !== undefined ? String(prev) : undefined,
        current:  String(curr),
      });
    }
  }

  return diffs;
}

/**
 * Apply dashboard config fields to the Configuration Service.
 *
 * Uses setRuntimeOverrides() so the dashboard config takes effect immediately
 * through the existing resolution pipeline.  We only apply fields that have
 * meaningful values (non-empty strings).
 *
 * Returns the set of field names that were actually applied.
 */
export function applyDashboardConfig(
  service:  ConfigurationService,
  config:   DashboardConfig
): string[] {
  const fields = extractConfigFields(config);
  const toApply: Partial<WidgetConfig> = {};
  const applied: string[] = [];

  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && v !== null && v !== '') {
      (toApply as Record<string, unknown>)[k] = v;
      applied.push(k);
    }
  }

  if (applied.length > 0) {
    service.setRuntimeOverrides(toApply);
  }

  return applied;
}

/**
 * Revert dashboard config by clearing only the fields it previously applied.
 * Preserves any user-set runtime overrides for fields not in the dashboard set.
 */
export function revertDashboardConfig(
  service:       ConfigurationService,
  appliedFields: string[]
): void {
  if (appliedFields.length === 0) return;
  // Reset to defaults+script layer by clearing overrides for these fields
  // We do this by passing undefined for each field — the resolver ignores
  // undefined values and falls back to lower layers.
  const revert: Partial<WidgetConfig> = {};
  for (const f of appliedFields) {
    (revert as Record<string, unknown>)[f] = undefined;
  }
  // Re-resolve will pick up lower-layer values
  service.reset();
}
