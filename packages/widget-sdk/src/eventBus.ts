/**
 * eventBus.ts
 *
 * Lightweight, fully-typed publish/subscribe event bus.
 *
 * Design principles:
 *   - Generic over EventPayloadMap so every event/payload pair is validated
 *     at compile time — no `any`, no `unknown`.
 *   - Listener order is preserved (insertion order).
 *   - Duplicate listeners are silently ignored (Set semantics per event).
 *   - Listener failures are isolated — one bad listener never stops the rest.
 *   - `once()` listeners are automatically removed after their first invocation.
 *   - No external dependencies.
 *   - Synchronous emit — listeners run in the same call stack as emit().
 *
 * Usage:
 *   const bus = createEventBus<EventPayloadMap>();
 *   bus.on('WIDGET_READY', (payload) => { ... });
 *   bus.emit('WIDGET_READY', { timestamp: '...', ... });
 */

import type { EventPayloadMap, WidgetEventName } from './events';

// ─── Types ────────────────────────────────────────────────────────────────────

/** A listener function for event E. */
export type EventListener<E extends WidgetEventName> =
  (payload: EventPayloadMap[E]) => void;

/** The public API of the event bus. */
export interface IEventBus {
  /**
   * Subscribe to an event. The listener will be called every time the event
   * is emitted. Duplicate registrations of the same function are ignored.
   */
  on<E extends WidgetEventName>(event: E, listener: EventListener<E>): void;

  /**
   * Unsubscribe a previously registered listener.
   * Silent no-op if the listener was not registered.
   */
  off<E extends WidgetEventName>(event: E, listener: EventListener<E>): void;

  /**
   * Subscribe to an event for a single invocation.
   * The listener is automatically removed after the first time the event fires.
   */
  once<E extends WidgetEventName>(event: E, listener: EventListener<E>): void;

  /**
   * Emit an event, synchronously invoking all registered listeners in order.
   * Errors thrown by individual listeners are caught and logged — they never
   * propagate to the caller.
   */
  emit<E extends WidgetEventName>(event: E, payload: EventPayloadMap[E]): void;

  /**
   * Remove all listeners for all events.
   * Useful during widget destruction to prevent memory leaks.
   */
  clear(): void;

  /** Returns the total number of active listeners across all events. */
  listenerCount(): number;

  /** Returns the name of the most recently emitted event, or null. */
  lastEvent(): WidgetEventName | null;
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Create a new event bus instance.
 * The returned object is typed against EventPayloadMap.
 */
export function createEventBus(): IEventBus {
  /**
   * Internal listener store.
   * We use an array of [listener, isOnce] tuples per event so we can:
   *   1. Preserve insertion order (Map preserves key insertion order)
   *   2. Track once-listeners without a separate data structure
   *   3. Avoid duplicates by checking before push
   */
  type ListenerEntry = [EventListener<WidgetEventName>, boolean];
  const store = new Map<WidgetEventName, ListenerEntry[]>();

  let _lastEvent: WidgetEventName | null = null;

  function getEntries(event: WidgetEventName): ListenerEntry[] {
    if (!store.has(event)) store.set(event, []);
    return store.get(event)!;
  }

  function on<E extends WidgetEventName>(
    event: E,
    listener: EventListener<E>,
    isOnce = false
  ): void {
    const entries = getEntries(event);
    // Duplicate prevention: same function reference → skip
    const alreadyRegistered = entries.some(([fn]) => fn === (listener as EventListener<WidgetEventName>));
    if (!alreadyRegistered) {
      entries.push([listener as EventListener<WidgetEventName>, isOnce]);
    }
  }

  return {
    on<E extends WidgetEventName>(event: E, listener: EventListener<E>): void {
      on(event, listener, false);
    },

    off<E extends WidgetEventName>(event: E, listener: EventListener<E>): void {
      const entries = store.get(event);
      if (!entries) return;
      const idx = entries.findIndex(([fn]) => fn === (listener as EventListener<WidgetEventName>));
      if (idx !== -1) entries.splice(idx, 1);
    },

    once<E extends WidgetEventName>(event: E, listener: EventListener<E>): void {
      on(event, listener, true);
    },

    emit<E extends WidgetEventName>(event: E, payload: EventPayloadMap[E]): void {
      _lastEvent = event;
      const entries = store.get(event);
      if (!entries || entries.length === 0) return;

      // Snapshot the array before iteration so that once-removal mid-loop
      // doesn't skip listeners.
      const snapshot = entries.slice();

      for (const [listener, isOnce] of snapshot) {
        // Remove once-listeners before calling them (mirrors browser behaviour)
        if (isOnce) {
          const idx = entries.findIndex(([fn]) => fn === listener);
          if (idx !== -1) entries.splice(idx, 1);
        }

        try {
          listener(payload as EventPayloadMap[WidgetEventName]);
        } catch (err) {
          // Isolate listener failures — log and continue
          console.error('[LeadFlow] Event listener threw an error:', err, '(event:', event, ')');
        }
      }
    },

    clear(): void {
      store.clear();
      _lastEvent = null;
    },

    listenerCount(): number {
      let count = 0;
      for (const entries of store.values()) count += entries.length;
      return count;
    },

    lastEvent(): WidgetEventName | null {
      return _lastEvent;
    },
  };
}

// ─── Singleton bus ────────────────────────────────────────────────────────────

/**
 * The singleton event bus shared by the entire SDK.
 * All modules import this instance — never create their own.
 */
export const eventBus: IEventBus = createEventBus();
