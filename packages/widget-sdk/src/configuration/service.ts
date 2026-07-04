/**
 * configuration/service.ts
 *
 * The Configuration Service — single source of truth for all SDK config.
 *
 * Responsibilities:
 *   load(layer2)           — accept script-tag attributes as Layer 2
 *   resolve()              — run the resolution pipeline → frozen WidgetConfig
 *   validate()             — validate the resolved config, emit warnings
 *   get()                  — return the current resolved config (or null)
 *   setRuntimeOverrides()  — apply Layer 3 overrides, re-resolve, emit CONFIG_UPDATED
 *   reset()                — clear all overrides, re-resolve from defaults+script, emit CONFIG_RESET
 *   getResolvedConfig()    — alias for get(), explicit name for public API
 *
 * The runtime owns exactly one ConfigurationService instance.
 * No globals — the instance is created in runtime.ts.
 *
 * Event emission:
 *   CONFIG_LOADING           — before resolution begins
 *   CONFIG_RESOLVED          — after first successful resolution
 *   CONFIG_UPDATED           — after setRuntimeOverrides() re-resolves
 *   CONFIG_RESET             — after reset() re-resolves
 *   CONFIG_VALIDATION_WARNING — for each non-fatal validation warning
 */

import { resolveConfig }                          from './resolver';
import { validateConfig }                          from './validator';
import { applyDefaults }                           from './defaults';
import { eventBus }                                from '../eventBus';
import { WidgetEvent }                             from '../events';
import { LOG_PREFIX }                              from '../constants';
import type { WidgetConfig }                       from '../types';
import type { ConfigLayer }                        from './resolver';
import type { ConfigurationSource }                from '../events';

// ─── Service ──────────────────────────────────────────────────────────────────

export class ConfigurationService {
  /** Layer 2: script tag attributes (set once by load()). */
  private _scriptLayer:   ConfigLayer = {};

  /** Layer 3: runtime overrides (updated by setRuntimeOverrides()). */
  private _overrideLayer: ConfigLayer = {};

  /** Layer 4: server config stub — always empty until backend is wired. */
  private readonly _serverLayer: ConfigLayer = {};

  /** The most recently resolved, frozen config. Null until resolve() succeeds. */
  private _resolved: Readonly<WidgetConfig> | null = null;

  /** Monotonically increasing version counter — incremented on every resolution. */
  private _version = 0;

  /** Validation warnings from the most recent resolution. */
  private _warnings: string[] = [];

  // ─── load ─────────────────────────────────────────────────────────────────

  /**
   * Load Layer 2 configuration from the script tag.
   * Must be called before resolve().
   * Calling again replaces the script layer entirely.
   */
  load(scriptConfig: ConfigLayer): void {
    this._scriptLayer = { ...scriptConfig };
  }

  // ─── resolve ──────────────────────────────────────────────────────────────

  /**
   * Run the resolution pipeline.
   *
   * Merges layers 1–4 in priority order, validates the result,
   * emits CONFIG_LOADING → CONFIG_RESOLVED (and any CONFIG_VALIDATION_WARNING).
   *
   * @returns The resolved, frozen WidgetConfig, or null if businessId is absent.
   */
  resolve(): Readonly<WidgetConfig> | null {
    const source = this._deriveSource();

    eventBus.emit(WidgetEvent.CONFIG_LOADING, {
      timestamp: new Date().toISOString(),
      source,
    });

    // Layer 1 provides defaults for optional fields only — businessId must come from above
    const layers: ConfigLayer[] = [
      this._scriptLayer,
      this._overrideLayer,
      this._serverLayer,
    ];

    const resolved = resolveConfig(layers);

    if (!resolved) {
      // businessId missing — cannot resolve
      console.error(
        `${LOG_PREFIX} Configuration resolution failed: businessId is required.`
      );
      return null;
    }

    // Validate the raw merged input (before defaults are applied) to catch
    // user-supplied invalid values and emit warnings for them.
    const rawMerged: Partial<WidgetConfig> = {};
    for (const layer of layers) {
      for (const key of Object.keys(layer) as (keyof WidgetConfig)[]) {
        const val = layer[key];
        if (val !== undefined && val !== null && val !== '') {
          (rawMerged as Record<string, unknown>)[key] = val;
        }
      }
    }

    // Build a config-shaped object to validate (use resolved for missing fields)
    const toValidate: WidgetConfig = {
      businessId:   rawMerged.businessId   ?? resolved.businessId,
      position:     rawMerged.position     ?? resolved.position,
      theme:        rawMerged.theme        ?? resolved.theme,
      primaryColor: rawMerged.primaryColor ?? resolved.primaryColor,
    };

    const result = validateConfig(toValidate);
    this._warnings = result.warnings.map(w => w.message);

    // Emit per-field warnings
    for (const w of result.warnings) {
      console.warn(`${LOG_PREFIX} Configuration warning [${w.field}]: ${w.message}`);
      eventBus.emit(WidgetEvent.CONFIG_VALIDATION_WARNING, {
        timestamp: new Date().toISOString(),
        field:     w.field,
        value:     w.value,
        message:   w.message,
      });
    }

    this._version++;
    this._resolved = resolved;

    eventBus.emit(WidgetEvent.CONFIG_RESOLVED, {
      timestamp:          new Date().toISOString(),
      businessId:         resolved.businessId,
      position:           resolved.position,
      theme:              resolved.theme,
      primaryColor:       resolved.primaryColor,
      source,
      overrideCount:      Object.keys(this._overrideLayer).length,
      validationWarnings: this._warnings,
      version:            this._version,
    });

    return resolved;
  }

  // ─── validate ─────────────────────────────────────────────────────────────

  /**
   * Validate the current resolved config without re-resolving.
   * Returns the most recent validation warnings.
   */
  validate(): string[] {
    if (!this._resolved) return [];
    const result = validateConfig(this._resolved);
    return result.warnings.map(w => w.message);
  }

  // ─── get / getResolvedConfig ───────────────────────────────────────────────

  /** Returns the current resolved config, or null if not yet resolved. */
  get(): Readonly<WidgetConfig> | null {
    return this._resolved;
  }

  /** Explicit alias for get() — preferred for public API consumers. */
  getResolvedConfig(): Readonly<WidgetConfig> | null {
    return this._resolved;
  }

  // ─── setRuntimeOverrides ──────────────────────────────────────────────────

  /**
   * Apply Layer 3 runtime overrides and re-resolve.
   *
   * Only the supplied fields are overridden — other fields keep their values.
   * Emits CONFIG_UPDATED after re-resolution.
   *
   * @param overrides - Partial config to merge into the override layer.
   */
  setRuntimeOverrides(overrides: Partial<WidgetConfig>): Readonly<WidgetConfig> | null {
    const changedFields = Object.keys(overrides) as (keyof WidgetConfig)[];

    // Merge into override layer — preserve previously set overrides
    this._overrideLayer = { ...this._overrideLayer, ...overrides };

    const resolved = this.resolve();
    if (!resolved) return null;

    eventBus.emit(WidgetEvent.CONFIG_UPDATED, {
      timestamp:     new Date().toISOString(),
      changedFields: changedFields.map(String),
      version:       this._version,
    });

    return resolved;
  }

  // ─── reset ────────────────────────────────────────────────────────────────

  /**
   * Clear all runtime overrides and re-resolve from defaults + script layer.
   * Emits CONFIG_RESET after re-resolution.
   */
  reset(): Readonly<WidgetConfig> | null {
    this._overrideLayer = {};
    const resolved = this.resolve();

    eventBus.emit(WidgetEvent.CONFIG_RESET, {
      timestamp: new Date().toISOString(),
      version:   this._version,
    });

    return resolved;
  }

  // ─── Diagnostics helpers ──────────────────────────────────────────────────

  /** Returns the current configuration version counter. */
  getVersion(): number {
    return this._version;
  }

  /** Returns the number of active override fields. */
  overrideCount(): number {
    return Object.keys(this._overrideLayer).length;
  }

  /** Returns a copy of the last validation warnings. */
  getValidationWarnings(): string[] {
    return [...this._warnings];
  }

  /** Returns the configuration source label for diagnostics. */
  getSource(): ConfigurationSource {
    return this._deriveSource();
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private _deriveSource(): ConfigurationSource {
    if (Object.keys(this._overrideLayer).length > 0)     return 'override';
    if (Object.keys(this._scriptLayer).length > 0)       return 'script';
    return 'defaults';
  }
}

// ─── Factory helper ───────────────────────────────────────────────────────────

/**
 * Create a new ConfigurationService instance.
 * Called once by runtime.ts — the instance is stored on the runtime object.
 */
export function createConfigurationService(): ConfigurationService {
  return new ConfigurationService();
}

// Re-export applyDefaults for convenience in config.ts
export { applyDefaults };
