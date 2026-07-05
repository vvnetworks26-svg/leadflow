/**
 * ui/tokens.ts — Immutable design tokens. Single source of truth.
 * Every visual value in the SDK references these tokens.
 * No hardcoded numbers or colours anywhere else.
 */

export const Spacing = Object.freeze({
  0:   '0px',
  1:   '4px',
  2:   '8px',
  3:   '12px',
  4:   '16px',
  5:   '20px',
  6:   '24px',
  8:   '32px',
  10:  '40px',
  12:  '48px',
  16:  '64px',
  20:  '80px',
} as const);

export const Typography = Object.freeze({
  fontFamily:   'inherit',
  fontSizeXs:   '11px',
  fontSizeSm:   '12px',
  fontSizeMd:   '14px',
  fontSizeLg:   '16px',
  fontSizeXl:   '18px',
  fontSize2xl:  '20px',
  fontSizeHero: '24px',
  weightNormal: '400',
  weightMedium: '500',
  weightSemi:   '600',
  weightBold:   '700',
  lineHeightTight:  '1.2',
  lineHeightNormal: '1.5',
  lineHeightRelaxed:'1.75',
} as const);

export const BorderRadius = Object.freeze({
  none:  '0px',
  sm:    '4px',
  md:    '8px',
  lg:    '12px',
  xl:    '16px',
  full:  '9999px',
} as const);

export const Elevation = Object.freeze({
  0: 'none',
  1: '0 1px 3px rgba(0,0,0,0.10)',
  2: '0 4px 12px rgba(0,0,0,0.12)',
  3: '0 8px 24px rgba(0,0,0,0.14)',
  4: '0 16px 40px rgba(0,0,0,0.16)',
} as const);

export const ColorsLight = Object.freeze({
  primary:         '#6366f1',
  primaryHover:    '#4f46e5',
  primaryForeground:'#ffffff',
  bg:              '#ffffff',
  bgSecondary:     '#f8fafc',
  bgTertiary:      '#f1f5f9',
  border:          '#e2e8f0',
  borderStrong:    '#cbd5e1',
  text:            '#0f172a',
  textMuted:       '#64748b',
  textSubtle:      '#94a3b8',
  success:         '#10b981',
  warning:         '#f59e0b',
  error:           '#ef4444',
  info:            '#3b82f6',
} as const);

export const ColorsDark = Object.freeze({
  primary:         '#818cf8',
  primaryHover:    '#6366f1',
  primaryForeground:'#ffffff',
  bg:              '#0f172a',
  bgSecondary:     '#1e293b',
  bgTertiary:      '#334155',
  border:          '#334155',
  borderStrong:    '#475569',
  text:            '#f8fafc',
  textMuted:       '#94a3b8',
  textSubtle:      '#64748b',
  success:         '#34d399',
  warning:         '#fbbf24',
  error:           '#f87171',
  info:            '#60a5fa',
} as const);

export const Opacity = Object.freeze({
  0:    '0',
  10:   '0.10',
  20:   '0.20',
  40:   '0.40',
  60:   '0.60',
  80:   '0.80',
  100:  '1',
} as const);

export const Transitions = Object.freeze({
  fast:    '100ms ease',
  normal:  '200ms ease',
  slow:    '300ms ease',
  spring:  '400ms cubic-bezier(0.34, 1.56, 0.64, 1)',
} as const);

export const ZIndex = Object.freeze({
  base:    0,
  raised:  10,
  overlay: 100,
  modal:   200,
  tooltip: 300,
  toast:   400,
  top:     2147483647,
} as const);

export const Breakpoints = Object.freeze({
  mobile:  0,
  tablet:  768,
  desktop: 1024,
} as const);

export const Duration = Object.freeze({
  fastest: 100,
  fast:    150,
  normal:  200,
  slow:    300,
  slowest: 400,
} as const);

export const Easing = Object.freeze({
  linear:   'linear',
  ease:     'ease',
  easeIn:   'ease-in',
  easeOut:  'ease-out',
  easeInOut:'ease-in-out',
  spring:   'cubic-bezier(0.34, 1.56, 0.64, 1)',
} as const);

/** All tokens in one frozen namespace for convenient import. */
export const Tokens = Object.freeze({
  spacing:      Spacing,
  typography:   Typography,
  borderRadius: BorderRadius,
  elevation:    Elevation,
  colors:       { light: ColorsLight, dark: ColorsDark },
  opacity:      Opacity,
  transitions:  Transitions,
  zIndex:       ZIndex,
  breakpoints:  Breakpoints,
  duration:     Duration,
  easing:       Easing,
} as const);
