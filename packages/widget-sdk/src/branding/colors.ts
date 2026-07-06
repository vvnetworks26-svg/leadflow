/**
 * branding/colors.ts — Color Engine.
 *
 * Generates immutable BrandPalette from BrandColors.
 * Uses pure functions — no side effects, no DOM access.
 *
 * Derived state computed automatically:
 *   hover    = darken primary 10%
 *   pressed  = darken primary 20%
 *   disabled = desaturated + lightened primary at 40% opacity
 *   border   = primary at 30% opacity blended with white
 */

import { ColorsLight, ColorsDark } from '../ui/tokens';
import type { BrandColors, BrandPalette, IColorEngine } from './types';

// ─── Hex utilities ────────────────────────────────────────────────────────────

/** Parse a 3 or 6-digit hex string to [r, g, b] (0-255 each). */
function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    const r = parseInt(clean[0]! + clean[0]!, 16);
    const g = parseInt(clean[1]! + clean[1]!, 16);
    const b = parseInt(clean[2]! + clean[2]!, 16);
    return [r, g, b];
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return [r, g, b];
  }
  return null;
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return '#' + [clamp(r), clamp(g), clamp(b)]
    .map(v => v.toString(16).padStart(2, '0'))
    .join('');
}

/** Darken a hex color by `amount` (0-100, as percentage of current luminance). */
function darken(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const factor = 1 - amount / 100;
  return rgbToHex(rgb[0] * factor, rgb[1] * factor, rgb[2] * factor);
}

/** Lighten a hex color by `amount` (0-100). */
function lighten(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const factor = amount / 100;
  return rgbToHex(
    rgb[0] + (255 - rgb[0]) * factor,
    rgb[1] + (255 - rgb[1]) * factor,
    rgb[2] + (255 - rgb[2]) * factor,
  );
}

/** Mix color with white at `weight` (0=original, 100=white). */
function mixWithWhite(hex: string, weight: number): string {
  return lighten(hex, weight);
}

/** Compute relative luminance (WCAG) for a hex color. */
function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Pick white or black for best contrast on the given background. */
function contrastForeground(bg: string): string {
  const lum = luminance(bg);
  return lum > 0.179 ? '#000000' : '#ffffff';
}

// ─── Validate & normalise hex ─────────────────────────────────────────────────

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function safeHex(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  if (HEX_RE.test(value)) return value;
  return fallback;
}

// ─── Default palettes ─────────────────────────────────────────────────────────

function buildDefaultPalette(mode: 'light' | 'dark'): BrandPalette {
  const tokens = mode === 'dark' ? ColorsDark : ColorsLight;
  const primary = tokens.primary;
  return {
    primary,
    secondary:        mode === 'light' ? '#64748b' : '#94a3b8',
    accent:           mode === 'light' ? '#f59e0b' : '#fbbf24',
    background:       tokens.bg,
    surface:          tokens.bgSecondary,
    text:             tokens.text,
    success:          tokens.success,
    warning:          tokens.warning,
    danger:           tokens.error,
    primaryHover:     darken(primary, 10),
    primaryPressed:   darken(primary, 20),
    primaryDisabled:  mixWithWhite(primary, 50),
    primaryBorder:    mixWithWhite(primary, 70),
    secondaryHover:   mode === 'light' ? '#475569' : '#cbd5e1',
    primaryForeground: '#ffffff',
  };
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export function createColorEngine(): IColorEngine {
  return {
    generate(colors: Partial<BrandColors>): BrandPalette {
      const base = buildDefaultPalette('light');
      const primary = safeHex(colors.primary, base.primary);

      return Object.freeze<BrandPalette>({
        primary,
        secondary:         safeHex(colors.secondary, base.secondary),
        accent:            safeHex(colors.accent,    base.accent),
        background:        safeHex(colors.background,base.background),
        surface:           safeHex(colors.surface,   base.surface),
        text:              safeHex(colors.text,       base.text),
        success:           safeHex(colors.success,    base.success),
        warning:           safeHex(colors.warning,    base.warning),
        danger:            safeHex(colors.danger,     base.danger),
        primaryHover:      darken(primary, 10),
        primaryPressed:    darken(primary, 20),
        primaryDisabled:   mixWithWhite(primary, 50),
        primaryBorder:     mixWithWhite(primary, 70),
        secondaryHover:    darken(safeHex(colors.secondary, base.secondary), 10),
        primaryForeground: contrastForeground(primary),
      });
    },

    getDefaults(mode: 'light' | 'dark'): BrandPalette {
      return Object.freeze(buildDefaultPalette(mode));
    },
  };
}

/** Convert a BrandPalette to CSS custom property declarations. */
export function paletteToCSSVars(palette: BrandPalette): Record<string, string> {
  return {
    '--lf-primary':           palette.primary,
    '--lf-primary-hover':     palette.primaryHover,
    '--lf-primary-pressed':   palette.primaryPressed,
    '--lf-primary-disabled':  palette.primaryDisabled,
    '--lf-primary-border':    palette.primaryBorder,
    '--lf-primary-fg':        palette.primaryForeground,
    '--lf-secondary':         palette.secondary,
    '--lf-secondary-hover':   palette.secondaryHover,
    '--lf-accent':            palette.accent,
    '--lf-bg':                palette.background,
    '--lf-bg-secondary':      palette.surface,
    '--lf-text':              palette.text,
    '--lf-success':           palette.success,
    '--lf-warning':           palette.warning,
    '--lf-error':             palette.danger,
  };
}
