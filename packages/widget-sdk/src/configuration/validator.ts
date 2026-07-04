/**
 * configuration/validator.ts
 *
 * Centralised validation for all configuration fields.
 *
 * Rules:
 *   - Never throws. Returns a result object with errors and warnings.
 *   - businessId failures → errors (fatal — initialization must abort).
 *   - All other field failures → warnings (non-fatal — fall back to default).
 *   - Descriptive messages suitable for console output.
 *   - No side effects. Pure functions only.
 */

import type { WidgetConfig, WidgetPosition, WidgetTheme } from '../types';

// ─── Allowed values ───────────────────────────────────────────────────────────

export const VALID_POSITIONS: ReadonlyArray<WidgetPosition> = [
  'bottom-right',
  'bottom-left',
  'top-right',
  'top-left',
];

export const VALID_THEMES: ReadonlyArray<WidgetTheme> = [
  'light',
  'dark',
  'auto',
];

const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// ─── Result type ──────────────────────────────────────────────────────────────

export interface ValidationResult {
  /** True when the configuration is usable (no fatal errors). */
  valid:    boolean;
  /** Fatal errors — businessId missing or empty. Widget must not initialize. */
  errors:   string[];
  /** Non-fatal warnings — invalid optional fields. SDK will fall back to defaults. */
  warnings: ValidationWarning[];
}

export interface ValidationWarning {
  field:   string;
  value:   string;
  message: string;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Validate a complete WidgetConfig.
 * Called by the Configuration Service after resolution.
 */
export function validateConfig(config: WidgetConfig): ValidationResult {
  const errors:   string[]           = [];
  const warnings: ValidationWarning[] = [];

  // ── businessId (required) ─────────────────────────────────────────────────
  if (!config.businessId || config.businessId.trim() === '') {
    errors.push(
      'businessId is required. ' +
      'Add data-business="YOUR_BUSINESS_ID" to the LeadFlow <script> tag.'
    );
  }

  // ── position (optional with default) ─────────────────────────────────────
  if (!(VALID_POSITIONS as string[]).includes(config.position)) {
    warnings.push({
      field:   'position',
      value:   String(config.position),
      message: `Invalid position "${config.position}". ` +
               `Valid values: ${VALID_POSITIONS.join(', ')}. ` +
               `Using default "bottom-right".`,
    });
  }

  // ── theme (optional with default) ────────────────────────────────────────
  if (!(VALID_THEMES as string[]).includes(config.theme)) {
    warnings.push({
      field:   'theme',
      value:   String(config.theme),
      message: `Invalid theme "${config.theme}". ` +
               `Valid values: ${VALID_THEMES.join(', ')}. ` +
               `Using default "auto".`,
    });
  }

  // ── primaryColor (optional with default) ─────────────────────────────────
  if (!HEX_COLOR_RE.test(config.primaryColor)) {
    warnings.push({
      field:   'primaryColor',
      value:   config.primaryColor,
      message: `Invalid primaryColor "${config.primaryColor}". ` +
               `Expected a hex colour (e.g. #6366f1 or #fff). ` +
               `Using default "#6366f1".`,
    });
  }

  return {
    valid:    errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate only the businessId field.
 * Used as a fast-path check before full resolution.
 */
export function validateBusinessId(businessId: string | undefined | null): boolean {
  return typeof businessId === 'string' && businessId.trim().length > 0;
}
