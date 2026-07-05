/**
 * integration/lifecycle.ts — Installation lifecycle manager.
 *
 * Owns:
 *   install()    — full install pipeline (compat → validate → mount → events)
 *   uninstall()  — destroy widget, reset to not-installed
 *   reinstall()  — uninstall + install in one call
 *   reload()     — alias for reinstall with the same embed mode
 *   status()     — current InstallationStatus
 *   getState()   — full InstallationState snapshot
 *   getDiagnostics() — C.5 diagnostics block
 *
 * State machine:
 *   not-installed → installing → installed
 *   installed     → not-installed  (via uninstall)
 *   installed     → installing     (via reinstall)
 *   any           → error          (on fatal failure)
 *   error/any     → not-installed  (via destroy)
 */

import { createInstaller }           from './installer';
import { resolveEmbedMode }          from './embed';
import { detectCapabilities }        from './compatibility';
import { eventBus }                  from '../eventBus';
import { WidgetEvent }               from '../events';
import { LOG_PREFIX }                from '../constants';
import type {
  EmbedMode,
  InstallResult,
  InstallationStatus,
  InstallationState,
  InstallationDiagnostics,
  ILifecycleManager,
} from './types';
import type { WidgetConfig } from '../types';
import type { EmbedConfig }  from './types';

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createLifecycleManager(
  /** The widget initialize function from loader.ts */
  initFn:   (config: WidgetConfig) => Promise<'mounted' | 'already-initialized' | 'error'>,
  /** The widget destroy function from loader.ts */
  destroyFn: () => void,
  /** Base config (businessId, position, theme, primaryColor) */
  config:   WidgetConfig & EmbedConfig,
  /** If true, mark as already installed (widget mounted before manager was created) */
  alreadyInstalled = false
): ILifecycleManager {

  let _status:             InstallationStatus = alreadyInstalled ? 'installed' : 'not-installed';
  let _installedAt:        string | null       = alreadyInstalled ? new Date().toISOString() : null;
  let _embedMode:          EmbedMode           = resolveEmbedMode(config.embedMode);
  let _compatWarnings:     string[]            = [];
  let _duplicatePrevented  = false;
  let _reinstallCount      = 0;

  return {

    async install(embedMode?: EmbedMode): Promise<InstallResult> {
      if (_status === 'installed') {
        console.warn(`${LOG_PREFIX} install() called when already installed — use reinstall()`);
      }

      const mode = resolveEmbedMode(embedMode ?? config.embedMode);
      _status    = 'installing';
      const ts   = new Date().toISOString();

      eventBus.emit(WidgetEvent.INSTALL_STARTED, {
        timestamp: ts,
        embedMode: mode,
      });

      // Run pre-flight checks via Installer
      const installer    = createInstaller(config);
      const preflightResult = installer.install(mode);

      // Capture compatibility warnings
      _compatWarnings    = preflightResult.compatibilityResult.warnings;
      _duplicatePrevented = preflightResult.duplicatePrevented;

      if (!preflightResult.success) {
        _status = preflightResult.duplicatePrevented ? 'installed' : 'error';
        return preflightResult;
      }

      // ── Run actual widget mount ──────────────────────────────────────────
      try {
        const initStatus = await initFn(config);

        if (initStatus === 'mounted') {
          _status      = 'installed';
          _installedAt = ts;
          _embedMode   = mode;

          eventBus.emit(WidgetEvent.INSTALL_COMPLETED, {
            timestamp:  ts,
            embedMode:  mode,
            businessId: config.businessId,
          });

          return {
            success:             true,
            status:              'installed',
            compatibilityResult: preflightResult.compatibilityResult,
            validationResult:    preflightResult.validationResult,
            installedAt:         ts,
            embedMode:           mode,
            duplicatePrevented:  false,
          };
        }

        if (initStatus === 'already-initialized') {
          _status             = 'installed';
          _duplicatePrevented = true;
          return {
            success:             false,
            status:              'installed',
            compatibilityResult: preflightResult.compatibilityResult,
            validationResult:    preflightResult.validationResult,
            installedAt:         null,
            embedMode:           mode,
            duplicatePrevented:  true,
            error:               'Widget already initialized',
          };
        }

        // initFn returned 'error'
        throw new Error('Widget initialization returned error status');

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        _status = 'error';
        eventBus.emit(WidgetEvent.INSTALL_FAILED, {
          timestamp: ts,
          reason:    'init-error',
          error:     msg,
        });
        return {
          success:             false,
          status:              'error',
          compatibilityResult: preflightResult.compatibilityResult,
          validationResult:    preflightResult.validationResult,
          installedAt:         null,
          embedMode:           mode,
          duplicatePrevented:  false,
          error:               msg,
        };
      }
    },

    uninstall(): void {
      if (_status !== 'installed') {
        console.warn(`${LOG_PREFIX} uninstall() called when status is "${_status}" — no-op`);
        return;
      }
      _status = 'not-installed'; // set before calling destroyFn to prevent re-entry
      _installedAt = null;
      destroyFn();
      eventBus.emit(WidgetEvent.UNINSTALL_COMPLETED, {
        timestamp: new Date().toISOString(),
      });
    },

    async reinstall(embedMode?: EmbedMode): Promise<InstallResult> {
      const mode = resolveEmbedMode(embedMode ?? _embedMode ?? config.embedMode);
      if (_status === 'installed') {
        _status      = 'not-installed'; // set before destroyFn to prevent re-entry
        _installedAt = null;
        destroyFn();
      }
      _reinstallCount++;

      // Skip the compatibility/duplicate preflight on reinstall — we know the
      // browser works (it already ran once). Just run init directly.
      _status = 'installing';
      const ts = new Date().toISOString();
      eventBus.emit(WidgetEvent.INSTALL_STARTED, { timestamp: ts, embedMode: mode });

      try {
        const initStatus = await initFn(config);
        if (initStatus === 'mounted' || initStatus === 'already-initialized') {
          _status      = 'installed';
          _installedAt = ts;
          _embedMode   = mode;
          const result: InstallResult = {
            success:             initStatus === 'mounted',
            status:              'installed',
            compatibilityResult: { compatible: true, capabilities: detectCapabilities(), warnings: [], degraded: [], missing: [] },
            validationResult:    { valid: true, errors: [], warnings: [] },
            installedAt:         ts,
            embedMode:           mode,
            duplicatePrevented:  initStatus === 'already-initialized',
          };
          if (result.success) {
            eventBus.emit(WidgetEvent.INSTALL_COMPLETED, {
              timestamp: ts, embedMode: mode, businessId: config.businessId,
            });
            eventBus.emit(WidgetEvent.REINSTALL_COMPLETED, {
              timestamp: new Date().toISOString(), embedMode: mode, reinstallCount: _reinstallCount,
            });
          }
          return result;
        }
        throw new Error('Widget initialization returned error status');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        _status = 'error';
        eventBus.emit(WidgetEvent.INSTALL_FAILED, { timestamp: ts, reason: 'init-error', error: msg });
        return {
          success: false, status: 'error',
          compatibilityResult: { compatible: true, capabilities: detectCapabilities(), warnings: [], degraded: [], missing: [] },
          validationResult: { valid: true, errors: [], warnings: [] },
          installedAt: null, embedMode: mode, duplicatePrevented: false, error: msg,
        };
      }
    },

    async reload(): Promise<InstallResult> {
      return this.reinstall(_embedMode);
    },

    status(): InstallationStatus {
      return _status;
    },

    getState(): InstallationState {
      return {
        status:                         _status,
        installedAt:                    _installedAt,
        embedMode:                      _embedMode,
        compatibilityWarnings:          _compatWarnings,
        browserCapabilities:            detectCapabilities(),
        duplicateInstallationPrevented: _duplicatePrevented,
        reinstallCount:                 _reinstallCount,
      };
    },

    getDiagnostics(): InstallationDiagnostics {
      return {
        installationStatus:             _status,
        installationTime:               _installedAt,
        embedMode:                      _embedMode,
        compatibilityWarnings:          _compatWarnings,
        browserCapabilities:            detectCapabilities(),
        duplicateInstallationPrevented: _duplicatePrevented,
      };
    },

    destroy(): void {
      // Guard: if already not-installed don't call destroyFn (avoids
      // re-entrancy when destroyWidget nulls us out then calls destroy).
      if (_status === 'installed') {
        _status = 'not-installed'; // set first to prevent re-entry
        destroyFn();
      }
      _status      = 'not-installed';
      _installedAt = null;
    },
  };
}
