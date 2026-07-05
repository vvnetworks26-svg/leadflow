/**
 * integration/embed.ts — Embed mode adapter.
 *
 * Translates an EmbedMode into renderer/container style adjustments.
 * The renderer already owns the Shadow DOM hierarchy — this module
 * only adjusts the container's positioning behaviour for each mode.
 *
 * Modes:
 *   floating    (default) — fixed-position widget, bottom-right/left corner
 *   inline      — rendered inside a host-supplied container element
 *   fullscreen  — full-viewport overlay
 *   popover     — future; falls back to floating
 */

import type { EmbedMode } from './types';

// ─── CSS per embed mode ───────────────────────────────────────────────────────

/**
 * Returns the CSS string to apply to the lf-container for the given mode.
 * Called once after the renderer mounts.
 */
export function getEmbedModeCSS(mode: EmbedMode): string {
  switch (mode) {
    case 'inline':
      // Relative positioning — widget sits in normal document flow
      return [
        'position:relative',
        'width:100%',
        'max-width:480px',
        'height:600px',
        'display:block',
      ].join(';');

    case 'fullscreen':
      // Fixed full-viewport overlay
      return [
        'position:fixed',
        'inset:0',
        'width:100%',
        'height:100%',
        'max-width:none',
        'max-height:none',
        'z-index:2147483647',
      ].join(';');

    case 'popover':
    case 'floating':
    default:
      // Standard floating — positioned by the launcher position setting
      return [
        'position:fixed',
        'z-index:2147483646',
      ].join(';');
  }
}

/**
 * Apply embed mode CSS to the widget container element.
 * If the container element cannot be found, this is a no-op.
 */
export function applyEmbedMode(
  containerEl: HTMLElement | null,
  mode: EmbedMode
): void {
  if (!containerEl) return;
  const css = getEmbedModeCSS(mode);
  // Merge rather than replace — preserve position offsets already set
  const existing = containerEl.style.cssText;
  const existingParts = existing.split(';').filter(p => p.trim());
  const newParts = css.split(';').filter(p => p.trim());

  // Build a property map: new parts override existing
  const propMap: Record<string, string> = {};
  for (const p of [...existingParts, ...newParts]) {
    const colon = p.indexOf(':');
    if (colon === -1) continue;
    const key = p.slice(0, colon).trim();
    const val = p.slice(colon + 1).trim();
    propMap[key] = val;
  }
  containerEl.style.cssText = Object.entries(propMap)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
}

/**
 * Resolve the effective embed mode from a string, defaulting to floating.
 * Popover falls back to floating (not yet implemented).
 */
export function resolveEmbedMode(raw: string | undefined): EmbedMode {
  if (!raw) return 'floating';
  if (raw === 'popover') return 'floating'; // future
  const valid: EmbedMode[] = ['inline', 'floating', 'fullscreen'];
  return valid.includes(raw as EmbedMode) ? (raw as EmbedMode) : 'floating';
}
