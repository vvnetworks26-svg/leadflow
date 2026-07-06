/**
 * branding/theme.ts — Branding theme integration.
 *
 * Bridges brand config to the existing Theme Engine and injects CSS
 * custom properties into the widget's Shadow DOM container.
 *
 * Does NOT replace the Theme Engine — it drives it.
 */

import { paletteToCSSVars }    from './colors';
import { CORNER_RADIUS_MAP, SHADOW_MAP } from './whiteLabel';
import type { IThemeEngine }   from '../ui/types';
import type {
  BrandPalette,
  ResolvedTypography,
  CornerRadius,
  ShadowPreset,
  AnimationPreset,
} from './types';

// ─── CSS var injection ────────────────────────────────────────────────────────

/**
 * Inject branding CSS variables into the given container element.
 * Called after the renderer mounts so the Shadow DOM root is available.
 * All vars are written onto the .lf-container element's inline style so
 * they cascade into all child components.
 */
export function injectBrandingVars(
  container:   HTMLElement | null,
  palette:     BrandPalette,
  typography:  ResolvedTypography,
  cornerRadius: CornerRadius,
  shadow:       ShadowPreset,
  animPreset:   AnimationPreset,
): void {
  if (!container) return;

  const vars: Record<string, string> = {
    ...paletteToCSSVars(palette),
    '--lf-font-family':    typography.fontFamily,
    '--lf-font-heading':   typography.headingSize,
    '--lf-font-body':      typography.bodySize,
    '--lf-font-small':     typography.smallSize,
    '--lf-line-height':    typography.lineHeight,
    '--lf-letter-spacing': typography.letterSpacing,
    '--lf-font-weight':    typography.fontWeight,
    '--lf-radius':         CORNER_RADIUS_MAP[cornerRadius] ?? '12px',
    '--lf-shadow':         SHADOW_MAP[shadow]              ?? SHADOW_MAP['medium']!,
    '--lf-anim-duration':  animPreset === 'none'       ? '0ms'
                         : animPreset === 'subtle'     ? '100ms'
                         : animPreset === 'expressive' ? '400ms'
                         : '200ms',
  };

  for (const [k, v] of Object.entries(vars)) {
    container.style.setProperty(k, v);
  }
}

/**
 * Sync brand theme mode with the existing Theme Engine.
 * Only updates the engine if the mode has actually changed.
 */
export function syncThemeMode(
  engine:   IThemeEngine,
  mode:     string,
): void {
  const current = engine.getTheme();
  const next    = (mode === 'light' || mode === 'dark' || mode === 'auto') ? mode : 'auto';
  if (current !== next) {
    engine.setTheme(next);
  }
}
