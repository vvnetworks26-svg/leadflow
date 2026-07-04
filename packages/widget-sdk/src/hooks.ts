/**
 * hooks.ts
 *
 * Synchronous lifecycle hooks for the widget runtime.
 *
 * Hooks are called at specific points in the initialize/destroy sequence,
 * BEFORE and AFTER the primary operation. They are synchronous — async hooks
 * are a future concern (e.g. pre-init network checks).
 *
 * Each hook type is a function with no return value.
 * Multiple hooks of the same type can be registered.
 * Hook failures are isolated — one failing hook does not stop the sequence.
 *
 * Hook execution order: registration order (FIFO).
 *
 * Available hooks:
 *   beforeInitialize — runs before the DOM root is mounted
 *   afterInitialize  — runs after READY state is reached
 *   beforeDestroy    — runs before the root is removed
 *   afterDestroy     — runs after DESTROYED state is reached
 */

import { LOG_PREFIX } from './constants';

// ─── Hook types ───────────────────────────────────────────────────────────────

export type HookFn = () => void;

export type HookName =
  | 'beforeInitialize'
  | 'afterInitialize'
  | 'beforeDestroy'
  | 'afterDestroy';

// ─── Hook store ───────────────────────────────────────────────────────────────

const _hooks = new Map<HookName, HookFn[]>([
  ['beforeInitialize', []],
  ['afterInitialize',  []],
  ['beforeDestroy',    []],
  ['afterDestroy',     []],
]);

// ─── Public API ───────────────────────────────────────────────────────────────

export const hooks = {
  /**
   * Register a hook function.
   * Duplicate registrations of the same function are silently ignored.
   */
  register(name: HookName, fn: HookFn): void {
    const list = _hooks.get(name)!;
    if (!list.includes(fn)) {
      list.push(fn);
    }
  },

  /**
   * Unregister a previously registered hook.
   * Silent no-op if the function was not registered.
   */
  unregister(name: HookName, fn: HookFn): void {
    const list = _hooks.get(name)!;
    const idx  = list.indexOf(fn);
    if (idx !== -1) list.splice(idx, 1);
  },

  /**
   * Run all registered hooks for the given name.
   * Each hook is called in registration order.
   * Errors are caught and logged — they never propagate to the caller.
   */
  run(name: HookName): void {
    const list = _hooks.get(name);
    if (!list) return;
    for (const fn of list) {
      try {
        fn();
      } catch (err) {
        console.error(`${LOG_PREFIX} Hook "${name}" threw an error:`, err);
      }
    }
  },

  /**
   * Remove all registered hooks for all hook names.
   * Called during widget destruction to prevent memory leaks.
   */
  clear(): void {
    for (const list of _hooks.values()) {
      list.length = 0;
    }
  },

  /** Returns the total count of registered hooks across all hook names. */
  count(): number {
    let n = 0;
    for (const list of _hooks.values()) n += list.length;
    return n;
  },
};
