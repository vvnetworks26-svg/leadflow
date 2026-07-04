/**
 * configuration/resolver.ts
 *
 * Combines all configuration layers into one immutable resolved object.
 *
 * Resolution precedence (lowest → highest):
 *   Layer 1 — SDK defaults          (CONFIG_DEFAULTS)
 *   Layer 2 — Script tag attributes  (parsed by config.ts)
 *   Layer 3 — Runtime overrides      (set via setRuntimeOverrides)
 *   Layer 4 — Server config stub     (future — always undefined for now)
 *
 * The result is frozen with Object.freeze() so modules cannot mutate it.
 *
 * Rules:
 *   - Higher priority layers win on a per-field basis.
 *   - null / undefined fields from a higher layer do NOT override a lower
 *     layer value — only defined, non-null values propagate up.
 *   - The resolver never emits events or writes to console.
 *     The service layer is responsible for logging and event emission.
 */

import type { WidgetConfig, WidgetPosition, WidgetTheme } from '../types';
import { CONFIG_DEFAULTS }                                  from './defaults';
import { VALID_POSITIONS, VALID_THEMES }                    from './validator';

// ─── Layer types ──────────────────────────────────────────────────────────────

/**
 * A partial configuration from any source layer.
 * businessId is required in Layer 2+ — it has no default.
 */
export type ConfigLayer = Partial<WidgetConfig>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Return `candidate` if it is a valid WidgetPosition, otherwise `fallback`. */
function resolvePosition(
  candidate: string | undefined,
  fallback:  WidgetPosition
): WidgetPosition {
  if (candidate && (VALID_POSITIONS as string[]).includes(candidate)) {
    return candidate as WidgetPosition;
  }
  return fallback;
}

/** Return `candidate` if it is a valid WidgetTheme, otherwise `fallback`. */
function resolveTheme(
  candidate: string | undefined,
  fallback:  WidgetTheme
): WidgetTheme {
  if (candidate && (VALID_THEMES as string[]).includes(candidate)) {
    return candidate as WidgetTheme;
  }
  return fallback;
}

/** Return `candidate` if it is a valid hex colour, otherwise `fallback`. */
function resolveColor(
  candidate: string | undefined,
  fallback:  string
): string {
  if (candidate && HEX_COLOR_RE.test(candidate)) return candidate;
  return fallback;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve all configuration layers into a single immutable WidgetConfig.
 *
 * @param layers - Configuration sources in ascending priority order.
 *                 Later layers override earlier layers.
 *                 businessId must be present in at least one layer.
 * @returns Frozen WidgetConfig, or null if businessId is absent everywhere.
 */
export function resolveConfig(layers: ConfigLayer[]): WidgetConfig | null {
  // Merge layers left-to-right (higher index = higher priority)
  let merged: ConfigLayer = {};
  for (const layer of layers) {
    for (const key of Object.keys(layer) as (keyof WidgetConfig)[]) {
      const val = layer[key];
      if (val !== undefined && val !== null && val !== '') {
        (merged as Record<string, unknown>)[key] = val;
      }
    }
  }

  // businessId is required — abort if missing
  if (!merged.businessId) return null;

  const resolved: WidgetConfig = {
    businessId:   merged.businessId,
    position:     resolvePosition(merged.position,     CONFIG_DEFAULTS.position),
    theme:        resolveTheme(merged.theme,           CONFIG_DEFAULTS.theme),
    primaryColor: resolveColor(merged.primaryColor,    CONFIG_DEFAULTS.primaryColor),
  };

  // Freeze — modules receive this; they must not mutate it
  return Object.freeze(resolved);
}
