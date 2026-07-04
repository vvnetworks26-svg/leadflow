/**
 * module.ts
 *
 * The SDK module interface contract.
 *
 * Every feature built on top of the widget runtime must implement IWidgetModule.
 * Modules are:
 *   - Completely isolated from each other
 *   - Never imported directly by other modules
 *   - Only communicate through the event bus
 *   - Registered with the ModuleRegistry
 *   - Initialized and destroyed by the runtime lifecycle
 *
 * Lifecycle hooks (all optional):
 *
 *   onRegister()   — called synchronously when the module is added to the registry.
 *                    Use for setup that must happen before initialize().
 *
 *   initialize()   — called when the runtime reaches READY.
 *                    Receives the current WidgetConfig.
 *
 *   onReady()      — alias for initialize(). Called after initialize() completes.
 *                    Can be used for post-init work without modifying initialize().
 *
 *   onDestroy()    — called before the module is fully torn down.
 *                    Use for cleanup: remove DOM nodes, cancel timers, etc.
 *
 *   destroy()      — called by the registry during destroyAll().
 *                    Should remove any side effects the module created.
 */

import type { WidgetConfig } from './types';

// ─── Module interface ─────────────────────────────────────────────────────────

export interface IWidgetModule {
  /**
   * Unique identifier for this module.
   * Used as the key in the registry. Must be kebab-case or dot-namespaced.
   * Example: 'core.analytics', 'ui.launcher', 'chat.engine'
   */
  readonly id: string;

  /**
   * Initialize the module.
   * Called by the registry when the runtime reaches READY.
   *
   * @param config - The resolved widget configuration.
   */
  initialize(config: WidgetConfig): void;

  /**
   * Destroy the module.
   * Called by the registry during destroyAll() or individual unregister().
   * Must be safe to call even if initialize() was never called.
   *
   * @param config - The current widget configuration, or null if destroyed before READY.
   */
  destroy(config: WidgetConfig | null): void;

  // ─── Optional lifecycle hooks ─────────────────────────────────────────────

  /** Called synchronously when the module is registered. Optional. */
  onRegister?(): void;

  /** Called after initialize() completes. Optional. */
  onReady?(): void;

  /** Called before destroy() is invoked. Optional. */
  onDestroy?(): void;
}
