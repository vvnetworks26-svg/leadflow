/**
 * integration/validator.ts — Configuration and placement validation.
 *
 * Validates the widget config and script tag placement.
 * Warnings never crash initialization — they are surfaced via events and
 * diagnostics only.
 */

import type { ValidationResult, EmbedConfig } from './types';
import type { WidgetConfig } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_POSITIONS   = ['bottom-right', 'bottom-left', 'top-right', 'top-left'] as const;
const VALID_THEMES      = ['light', 'dark', 'auto'] as const;
const VALID_EMBED_MODES = ['inline', 'floating', 'fullscreen', 'popover'] as const;
const HEX_COLOR_RE      = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const LOCALE_RE         = /^[a-z]{2}(-[A-Z]{2})?$/;

// ─── Field validators ─────────────────────────────────────────────────────────

function validateBusinessId(id: string | null | undefined, errors: string[], warnings: string[]): void {
  if (!id || id.trim() === '') {
    errors.push('businessId is required and cannot be empty');
    return;
  }
  if (id.length < 3) {
    warnings.push(`businessId "${id}" is unusually short — verify it is correct`);
  }
  if (id.length > 128) {
    warnings.push(`businessId "${id.slice(0, 20)}…" is unusually long`);
  }
}

function validatePosition(pos: string | null | undefined, warnings: string[]): void {
  if (!pos) return; // position has a default
  if (!(VALID_POSITIONS as readonly string[]).includes(pos)) {
    warnings.push(
      `position "${pos}" is not recognised — using default. ` +
      `Valid values: ${VALID_POSITIONS.join(', ')}`
    );
  }
}

function validateTheme(theme: string | null | undefined, warnings: string[]): void {
  if (!theme) return; // theme has a default
  if (!(VALID_THEMES as readonly string[]).includes(theme)) {
    warnings.push(
      `theme "${theme}" is not recognised — using default. ` +
      `Valid values: ${VALID_THEMES.join(', ')}`
    );
  }
}

function validatePrimaryColor(color: string | null | undefined, warnings: string[]): void {
  if (!color) return; // primaryColor has a default
  if (!HEX_COLOR_RE.test(color)) {
    warnings.push(
      `primaryColor "${color}" is not a valid hex colour — using default. ` +
      `Expected format: #rrggbb or #rgb`
    );
  }
}

function validateEmbedMode(mode: string | null | undefined, warnings: string[]): void {
  if (!mode) return;
  if (!(VALID_EMBED_MODES as readonly string[]).includes(mode)) {
    warnings.push(
      `embedMode "${mode}" is not recognised — using default (floating). ` +
      `Valid values: ${VALID_EMBED_MODES.join(', ')}`
    );
  }
  if (mode === 'popover') {
    warnings.push('embedMode "popover" is reserved for a future release — falling back to floating');
  }
}

function validateLocale(locale: string | null | undefined, warnings: string[]): void {
  if (!locale) return;
  if (!LOCALE_RE.test(locale)) {
    warnings.push(
      `locale "${locale}" does not match expected format (e.g. "en" or "en-US")`
    );
  }
}

// ─── Script placement validator ───────────────────────────────────────────────

/**
 * Checks whether the script tag is placed in a reasonable location.
 * Only emits warnings — never errors.
 */
export function validateScriptPlacement(warnings: string[]): void {
  if (typeof document === 'undefined') return;

  const scripts = document.querySelectorAll('script[data-business]');
  if (scripts.length > 1) {
    warnings.push(
      `Multiple LeadFlow script tags detected (${scripts.length}) — ` +
      `only one instance will be initialized`
    );
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Validate widget configuration.
 * Returns errors (fatal) and warnings (non-fatal).
 */
export function validateConfig(
  config: Partial<WidgetConfig> & EmbedConfig
): ValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  validateBusinessId(config.businessId, errors, warnings);
  validatePosition(config.position, warnings);
  validateTheme(config.theme, warnings);
  validatePrimaryColor(config.primaryColor, warnings);
  validateEmbedMode(config.embedMode, warnings);
  validateLocale(config.locale, warnings);
  validateScriptPlacement(warnings);

  return {
    valid:    errors.length === 0,
    errors,
    warnings,
  };
}
