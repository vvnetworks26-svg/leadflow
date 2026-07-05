/**
 * integration/installer.ts — Widget installer.
 *
 * Responsibilities:
 *   - Detect duplicate installations and prevent them
 *   - Run compatibility check
 *   - Run config validation
 *   - Coordinate with loader.ts to do the actual DOM mount
 *
 * Never throws — all results are returned as InstallResult objects.
 */

import { checkCompatibility }        from './compatibility';
import { validateConfig }             from './validator';
import { resolveEmbedMode }           from './embed';
import { eventBus }                   from '../eventBus';
import { WidgetEvent }                from '../events';
import { LOG_PREFIX, ROOT_ID }        from '../constants';
import type {
  EmbedMode,
  InstallResult,
  IInstaller,
  CompatibilityResult,
} from './types';
import type { WidgetConfig } from '../types';
import type { EmbedConfig } from './types';

// ─── Duplicate-installation sentinel ─────────────────────────────────────────

/**
 * Returns true if a widget root element is already present in the DOM.
 * Used to prevent two concurrent instances on the same page.
 */
function isAlreadyPresent(): boolean {
  if (typeof document === 'undefined') return false;
  return document.getElementById(ROOT_ID) !== null;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createInstaller(
  config: Partial<WidgetConfig> & EmbedConfig
): IInstaller {

  let _compatResult: CompatibilityResult | null = null;

  return {

    isDuplicate(): boolean {
      return isAlreadyPresent();
    },

    getCompatibility(): CompatibilityResult {
      if (!_compatResult) _compatResult = checkCompatibility();
      return _compatResult;
    },

    install(embedMode?: EmbedMode): InstallResult {
      const ts = new Date().toISOString();

      // ── Duplicate check ──────────────────────────────────────────────────
      if (isAlreadyPresent()) {
        console.warn(`${LOG_PREFIX} Duplicate installation prevented — widget already mounted`);
        eventBus.emit(WidgetEvent.INSTALL_FAILED, {
          timestamp: ts,
          reason:    'duplicate',
          error:     'Widget is already installed on this page',
        });
        const compat = this.getCompatibility();
        return {
          success:             false,
          status:              'installed',   // already there
          compatibilityResult: compat,
          validationResult:    { valid: false, errors: ['Widget already installed'], warnings: [] },
          installedAt:         null,
          embedMode:           resolveEmbedMode(embedMode),
          duplicatePrevented:  true,
          error:               'Widget already installed on this page',
        };
      }

      // ── Compatibility check ──────────────────────────────────────────────
      const compat = this.getCompatibility();
      if (compat.warnings.length > 0) {
        for (const w of compat.warnings) {
          console.warn(`${LOG_PREFIX} Compatibility: ${w}`);
          eventBus.emit(WidgetEvent.COMPATIBILITY_WARNING, {
            timestamp: ts,
            message:   w,
            capabilities: compat.capabilities,
          });
        }
      }

      if (!compat.compatible) {
        const msg = compat.missing.join('; ');
        console.error(`${LOG_PREFIX} Browser incompatible: ${msg}`);
        eventBus.emit(WidgetEvent.INSTALL_FAILED, {
          timestamp: ts,
          reason:    'incompatible',
          error:     msg,
        });
        return {
          success:             false,
          status:              'error',
          compatibilityResult: compat,
          validationResult:    { valid: false, errors: [msg], warnings: [] },
          installedAt:         null,
          embedMode:           resolveEmbedMode(embedMode),
          duplicatePrevented:  false,
          error:               msg,
        };
      }

      // ── Config validation ────────────────────────────────────────────────
      const validation = validateConfig(config);
      if (validation.warnings.length > 0) {
        for (const w of validation.warnings) {
          console.warn(`${LOG_PREFIX} Config: ${w}`);
        }
      }
      if (!validation.valid) {
        const msg = validation.errors.join('; ');
        console.error(`${LOG_PREFIX} Invalid config: ${msg}`);
        eventBus.emit(WidgetEvent.INSTALL_FAILED, {
          timestamp: ts,
          reason:    'invalid-config',
          error:     msg,
        });
        return {
          success:             false,
          status:              'error',
          compatibilityResult: compat,
          validationResult:    validation,
          installedAt:         null,
          embedMode:           resolveEmbedMode(embedMode),
          duplicatePrevented:  false,
          error:               msg,
        };
      }

      // ── All checks passed ────────────────────────────────────────────────
      const resolvedMode = resolveEmbedMode(embedMode ?? config.embedMode);
      return {
        success:             true,
        status:              'installing',
        compatibilityResult: compat,
        validationResult:    validation,
        installedAt:         ts,
        embedMode:           resolvedMode,
        duplicatePrevented:  false,
      };
    },
  };
}
