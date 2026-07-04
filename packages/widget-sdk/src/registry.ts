/**
 * registry.ts
 *
 * Module registry — manages the collection of IWidgetModule instances.
 *
 * Responsibilities:
 *   - Register and unregister modules
 *   - Prevent duplicate module IDs
 *   - Maintain registration order (Map preserves insertion order)
 *   - Initialize all modules when the runtime reaches READY
 *   - Destroy all modules when the runtime is destroyed
 *   - Emit MODULE_* events on the shared event bus
 *
 * Rules:
 *   - Modules never import each other
 *   - The registry never imports loader.ts or index.ts (no circular deps)
 *   - All inter-module communication goes through the event bus
 */

import type { IWidgetModule } from './module';
import type { WidgetConfig }  from './types';
import { eventBus }           from './eventBus';
import { WidgetEvent }        from './events';
import { LOG_PREFIX }         from './constants';

// ─── Registry implementation ──────────────────────────────────────────────────

/** Internal storage: moduleId → module instance, insertion-order preserved. */
const _modules = new Map<string, IWidgetModule>();

// ─── Public API ───────────────────────────────────────────────────────────────

export const registry = {
  /**
   * Register a module.
   *
   * If the module ID is already registered, logs a warning and returns false.
   * Calls module.onRegister() if defined, then emits MODULE_REGISTERED.
   *
   * @returns true on success, false if the ID was already taken.
   */
  register(mod: IWidgetModule): boolean {
    if (_modules.has(mod.id)) {
      console.warn(
        `${LOG_PREFIX} Module "${mod.id}" is already registered — skipping duplicate.`
      );
      return false;
    }

    _modules.set(mod.id, mod);

    // Optional pre-init hook
    if (typeof mod.onRegister === 'function') {
      try {
        mod.onRegister();
      } catch (err) {
        console.error(`${LOG_PREFIX} Module "${mod.id}" onRegister() threw:`, err);
      }
    }

    eventBus.emit(WidgetEvent.MODULE_REGISTERED, {
      timestamp: new Date().toISOString(),
      moduleId:  mod.id,
    });

    return true;
  },

  /**
   * Unregister a module by ID.
   *
   * Calls module.onDestroy() and module.destroy() before removal.
   * Emits MODULE_DESTROYED.
   *
   * @returns true if found and removed, false if not found.
   */
  unregister(id: string, config: WidgetConfig | null = null): boolean {
    const mod = _modules.get(id);
    if (!mod) return false;

    _callOnDestroy(mod, config);
    _modules.delete(id);

    eventBus.emit(WidgetEvent.MODULE_DESTROYED, {
      timestamp: new Date().toISOString(),
      moduleId:  id,
    });

    return true;
  },

  /**
   * Retrieve a registered module by ID.
   * Returns undefined if not found.
   */
  get(id: string): IWidgetModule | undefined {
    return _modules.get(id);
  },

  /**
   * Returns all registered modules in registration order.
   */
  getAll(): IWidgetModule[] {
    return Array.from(_modules.values());
  },

  /**
   * Initialize all registered modules.
   * Called by the loader when the runtime reaches READY.
   *
   * Each module is initialized independently — one failure does not stop others.
   * Emits MODULE_INITIALIZED for each module that succeeds.
   */
  initializeAll(config: WidgetConfig): void {
    for (const mod of _modules.values()) {
      try {
        mod.initialize(config);

        if (typeof mod.onReady === 'function') {
          mod.onReady();
        }

        eventBus.emit(WidgetEvent.MODULE_INITIALIZED, {
          timestamp: new Date().toISOString(),
          moduleId:  mod.id,
        });
      } catch (err) {
        console.error(`${LOG_PREFIX} Module "${mod.id}" initialize() threw:`, err);
      }
    }
  },

  /**
   * Destroy all registered modules.
   * Called by the loader when the runtime is destroyed.
   *
   * Iterates in reverse registration order so dependents are torn down
   * before their dependencies. Each failure is isolated.
   *
   * NOTE: The registry is NOT cleared — modules survive across the
   * destroy/re-initialize lifecycle. They will receive initialize() again
   * on the next initializeAll() call.
   */
  destroyAll(config: WidgetConfig | null = null): void {
    const all = Array.from(_modules.values()).reverse();
    for (const mod of all) {
      _callOnDestroy(mod, config);

      eventBus.emit(WidgetEvent.MODULE_DESTROYED, {
        timestamp: new Date().toISOString(),
        moduleId:  mod.id,
      });
    }
    // Do not clear _modules — modules persist for the next initialize cycle.
  },

  /** Returns the number of currently registered modules. */
  size(): number {
    return _modules.size;
  },
};

// ─── Private helpers ──────────────────────────────────────────────────────────

function _callOnDestroy(mod: IWidgetModule, config: WidgetConfig | null): void {
  if (typeof mod.onDestroy === 'function') {
    try {
      mod.onDestroy();
    } catch (err) {
      console.error(`${LOG_PREFIX} Module "${mod.id}" onDestroy() threw:`, err);
    }
  }
  try {
    mod.destroy(config);
  } catch (err) {
    console.error(`${LOG_PREFIX} Module "${mod.id}" destroy() threw:`, err);
  }
}
