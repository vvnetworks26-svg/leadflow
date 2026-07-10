/**
 * PreviewService.ts
 *
 * Generates live preview data for the widget configurator.
 * Returns a complete preview payload that the frontend renders
 * instantly without a round-trip to the DB on every keystroke.
 */

import { WidgetConfigService }     from '../branding/WidgetConfigService';
import { LocalizationService }     from '../localization/LocalizationService';
import type { IWidgetConfiguration } from '../../models/WidgetConfiguration.model';

export type PreviewDevice = 'desktop' | 'tablet' | 'mobile';

export interface PreviewPayload {
  config:     IWidgetConfiguration;
  strings:    Record<string, string>;
  isRTL:      boolean;
  device:     PreviewDevice;
  cssVars:    Record<string, string>;
  generatedAt:string;
}

function buildCssVars(config: IWidgetConfiguration): Record<string, string> {
  const c = config.colors;
  const t = config.typography;
  return {
    '--lf-accent':          c.accentColor,
    '--lf-bg':              c.backgroundColor,
    '--lf-surface':         c.surfaceColor,
    '--lf-text-primary':    c.textPrimary,
    '--lf-text-secondary':  c.textSecondary,
    '--lf-border':          c.borderColor,
    '--lf-user-bubble':     c.userBubbleColor,
    '--lf-ai-bubble':       c.aiBubbleColor,
    '--lf-user-text':       c.userTextColor,
    '--lf-ai-text':         c.aiTextColor,
    '--lf-radius':          `${config.borderRadius}px`,
    '--lf-font-family':     t.fontFamily,
    '--lf-font-size':       t.fontSize,
    '--lf-font-weight':     t.fontWeight,
    '--lf-line-height':     t.lineHeight,
    '--lf-launcher-size':   `${config.launcher.size}px`,
    '--lf-shadow':          getShadowValue(config.shadowStyle),
  };
}

function getShadowValue(style: string): string {
  const shadows: Record<string, string> = {
    none: 'none',
    sm:   '0 1px 2px rgba(0,0,0,0.05)',
    md:   '0 4px 6px rgba(0,0,0,0.07)',
    lg:   '0 10px 15px rgba(0,0,0,0.1)',
    xl:   '0 20px 25px rgba(0,0,0,0.15)',
    glow: '0 0 20px rgba(99,102,241,0.4)',
  };
  return shadows[style] ?? shadows.lg;
}

export const PreviewService = {

  async generate(
    organizationId: string,
    device:         PreviewDevice = 'desktop',
    overrides?:     Partial<IWidgetConfiguration>,
  ): Promise<PreviewPayload> {
    const base = await WidgetConfigService.get(organizationId);

    // Apply overrides without persisting (in-memory only)
    const config: IWidgetConfiguration = overrides
      ? { ...base, ...overrides, colors: { ...base.colors, ...(overrides.colors ?? {}) } } as IWidgetConfiguration
      : base;

    const { strings, isRTL } = await LocalizationService.resolve(organizationId, config.localeCode ?? 'en');
    const cssVars = buildCssVars(config);

    return {
      config,
      strings: strings as Record<string, string>,
      isRTL,
      device,
      cssVars,
      generatedAt: new Date().toISOString(),
    };
  },
};
