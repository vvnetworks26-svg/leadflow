/**
 * branding/whiteLabel.ts — White Label Manager.
 *
 * Applies white-label overrides to the visual layer.
 * Internal runtime identifiers (businessId, SDK version, etc.) are preserved.
 * Only the user-facing visual layer is replaced.
 */

import { LOG_PREFIX } from '../constants';
import type { WhiteLabelConfig, IWhiteLabelManager } from './types';

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: WhiteLabelConfig = {
  hidePoweredBy:    false,
  poweredByText:    'Powered by LeadFlow',
  companyName:      'LeadFlow Chat',
  colors:           {},
  typography:       {},
  assets:           {},
  cornerRadius:     'large',
  shadowPreset:     'medium',
  animationPreset:  'normal',
};

// ─── Corner radius map ────────────────────────────────────────────────────────

export const CORNER_RADIUS_MAP: Record<string, string> = {
  none:   '0px',
  small:  '6px',
  medium: '8px',
  large:  '12px',
  pill:   '9999px',
};

export const SHADOW_MAP: Record<string, string> = {
  none:    'none',
  subtle:  '0 1px 3px rgba(0,0,0,0.10)',
  medium:  '0 8px 32px rgba(0,0,0,0.14)',
  strong:  '0 16px 40px rgba(0,0,0,0.20)',
};

// ─── Manager ─────────────────────────────────────────────────────────────────

export function createWhiteLabelManager(): IWhiteLabelManager {
  let _config: WhiteLabelConfig = { ...DEFAULT_CONFIG };
  let _enabled = false;

  return {
    apply(config: WhiteLabelConfig): void {
      _config = {
        hidePoweredBy:   config.hidePoweredBy   ?? DEFAULT_CONFIG.hidePoweredBy,
        poweredByText:   config.poweredByText    ?? DEFAULT_CONFIG.poweredByText,
        companyName:     config.companyName      ?? DEFAULT_CONFIG.companyName,
        colors:          config.colors           ?? DEFAULT_CONFIG.colors,
        typography:      config.typography       ?? DEFAULT_CONFIG.typography,
        assets:          config.assets           ?? DEFAULT_CONFIG.assets,
        cornerRadius:    config.cornerRadius     ?? DEFAULT_CONFIG.cornerRadius,
        shadowPreset:    config.shadowPreset     ?? DEFAULT_CONFIG.shadowPreset,
        animationPreset: config.animationPreset  ?? DEFAULT_CONFIG.animationPreset,
      };
      _enabled = true;
      console.log(`${LOG_PREFIX} White label config applied`);
    },

    reset(): void {
      _config  = { ...DEFAULT_CONFIG };
      _enabled = false;
    },

    isEnabled(): boolean {
      return _enabled;
    },

    getConfig(): Readonly<WhiteLabelConfig> {
      return Object.freeze({ ..._config });
    },
  };
}
