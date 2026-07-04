/**
 * config.ts
 *
 * Layer 2 adapter — reads the <script> tag's data-* attributes and produces
 * a raw ConfigLayer for the Configuration Service pipeline.
 *
 * What changed in B.1.4:
 *   - Validation logic moved to configuration/validator.ts
 *   - Default values moved to configuration/defaults.ts
 *   - Resolution moved to configuration/resolver.ts
 *   - This file is now a thin script-attribute reader
 *
 * parseScriptAttributes() — new preferred entry point (returns raw layer)
 * parseConfig()           — retained for backwards compatibility with B.1.1–B.1.3
 */

import { LOG_PREFIX }                 from './constants';
import { validateBusinessId }         from './configuration/validator';
import { resolveConfig }              from './configuration/resolver';
import { validateConfig }             from './configuration/validator';
import type { WidgetConfig }          from './types';
import type { ConfigLayer }           from './configuration/resolver';

// ─── Raw attribute reader ─────────────────────────────────────────────────────

/**
 * Read all recognised data-* attributes from a <script> element.
 * Returns a ConfigLayer — undefined fields are omitted (not defaulted here).
 * No validation, no warnings. The Configuration Service handles those.
 */
export function parseScriptAttributes(script: HTMLScriptElement): ConfigLayer {
  const layer: ConfigLayer = {};

  const businessId = script.dataset['business']?.trim();
  if (businessId)   layer.businessId   = businessId;

  const position = script.dataset['position']?.trim();
  if (position)     layer.position     = position as WidgetConfig['position'];

  const theme = script.dataset['theme']?.trim();
  if (theme)        layer.theme        = theme as WidgetConfig['theme'];

  const primaryColor = script.dataset['primaryColor']?.trim();
  if (primaryColor) layer.primaryColor = primaryColor;

  return layer;
}

// ─── Legacy parseConfig (B.1.1–B.1.3 backwards compat) ───────────────────────

/**
 * Parse and fully resolve configuration from a <script> element.
 * Retained for backwards compatibility — new code uses parseScriptAttributes()
 * + ConfigurationService.
 */
export function parseConfig(script: HTMLScriptElement): WidgetConfig | null {
  const layer = parseScriptAttributes(script);

  if (!validateBusinessId(layer.businessId)) {
    console.error(
      `${LOG_PREFIX} Missing required attribute data-business on the LeadFlow script tag. ` +
      'The widget cannot initialize without a business ID.\n' +
      'Example: <script src="widget.js" data-business="YOUR_BUSINESS_ID"></script>'
    );
    return null;
  }

  const resolved = resolveConfig([layer]);
  if (!resolved) return null;

  const result = validateConfig(resolved);
  for (const w of result.warnings) {
    console.warn(`${LOG_PREFIX} ${w.message}`);
  }

  return resolved;
}
