/**
 * branding/typography.ts — Typography Engine.
 *
 * Resolves a BrandTypography config into concrete CSS-ready values.
 * Future-ready for Google Fonts — does not load remote fonts yet.
 * Pure functions, no side effects.
 */

import type {
  BrandTypography,
  ResolvedTypography,
  ITypographyEngine,
} from './types';

// ─── Scale maps ───────────────────────────────────────────────────────────────

const HEADING_SCALE: Record<NonNullable<BrandTypography['headingScale']>, string> = {
  compact: '18px',
  normal:  '20px',
  large:   '24px',
};

const BODY_SCALE: Record<NonNullable<BrandTypography['bodyScale']>, string> = {
  compact: '13px',
  normal:  '14px',
  large:   '16px',
};

const LINE_HEIGHT: Record<NonNullable<BrandTypography['lineHeight']>, string> = {
  tight:   '1.2',
  normal:  '1.5',
  relaxed: '1.75',
};

const LETTER_SPACING: Record<NonNullable<BrandTypography['letterSpacing']>, string> = {
  tight:  '-0.02em',
  normal: '0em',
  wide:   '0.04em',
};

const FONT_WEIGHT: Record<NonNullable<BrandTypography['weight']>, string> = {
  light:  '300',
  normal: '400',
  medium: '500',
  bold:   '700',
};

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULTS: ResolvedTypography = {
  fontFamily:    'inherit',
  headingSize:   '20px',
  bodySize:      '14px',
  smallSize:     '12px',
  lineHeight:    '1.5',
  letterSpacing: '0em',
  fontWeight:    '400',
};

// ─── Engine ───────────────────────────────────────────────────────────────────

export function createTypographyEngine(): ITypographyEngine {
  return {
    resolve(config?: BrandTypography): ResolvedTypography {
      if (!config) return { ...DEFAULTS };

      const headingScale = config.headingScale ?? 'normal';
      const bodyScale    = config.bodyScale    ?? 'normal';

      // smallSize is always one step below body
      const smallMap: Record<string, string> = {
        compact: '11px', normal: '12px', large: '14px',
      };

      return Object.freeze<ResolvedTypography>({
        fontFamily:    config.fontFamily    ?? DEFAULTS.fontFamily,
        headingSize:   HEADING_SCALE[headingScale],
        bodySize:      BODY_SCALE[bodyScale],
        smallSize:     smallMap[bodyScale]!,
        lineHeight:    LINE_HEIGHT[config.lineHeight ?? 'normal'],
        letterSpacing: LETTER_SPACING[config.letterSpacing ?? 'normal'],
        fontWeight:    FONT_WEIGHT[config.weight ?? 'normal'],
      });
    },

    getDefaults(): ResolvedTypography {
      return { ...DEFAULTS };
    },

    toCSSVars(resolved: ResolvedTypography): Record<string, string> {
      return {
        '--lf-font-family':     resolved.fontFamily,
        '--lf-font-heading':    resolved.headingSize,
        '--lf-font-body':       resolved.bodySize,
        '--lf-font-small':      resolved.smallSize,
        '--lf-line-height':     resolved.lineHeight,
        '--lf-letter-spacing':  resolved.letterSpacing,
        '--lf-font-weight':     resolved.fontWeight,
      };
    },
  };
}
