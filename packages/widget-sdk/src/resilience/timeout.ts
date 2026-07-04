/**
 * resilience/timeout.ts
 *
 * Timeout management using AbortController.
 *
 * Features:
 *   - Default timeout (applies to all requests unless overridden)
 *   - Per-request timeout override
 *   - Infinite timeout (timeoutMs = 0)
 *   - Disabled timeout (timeoutMs = -1, same as 0 for this implementation)
 *   - Returns an AbortController that fires after the timeout
 *   - Cleanup: clearTimeout called on dispose()
 */

export interface TimeoutHandle {
  /** The AbortController whose signal fires when the timeout expires. */
  controller:   AbortController;
  /** Clear the timeout without aborting. Call on success/cancel. */
  clear():      void;
  /** Whether the timeout has already fired. */
  readonly fired: boolean;
}

/**
 * Create a timeout-backed AbortController.
 *
 * @param ms       - Timeout in milliseconds. 0 or negative = no timeout.
 * @param onFired  - Optional callback invoked when the timeout fires.
 * @returns A TimeoutHandle. Call .clear() when the operation completes.
 */
export function createTimeout(
  ms:      number,
  onFired?: () => void
): TimeoutHandle {
  const controller = new AbortController();
  let   timerId:   ReturnType<typeof setTimeout> | null = null;
  let   _fired     = false;

  if (ms > 0) {
    timerId = setTimeout(() => {
      _fired = true;
      controller.abort();
      onFired?.();
    }, ms);
  }

  return {
    controller,
    clear() {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    },
    get fired() { return _fired; },
  };
}

/**
 * Resolve the effective timeout in ms for a request.
 *
 * Priority:
 *   -1 → no timeout (treat as 0)
 *    0 → use defaultMs
 *   >0 → use this value
 */
export function resolveTimeout(requestMs: number, defaultMs: number): number {
  if (requestMs < 0) return 0;      // explicitly disabled
  if (requestMs > 0) return requestMs; // explicit override
  return defaultMs;                  // fall back to default
}

/**
 * Merge two AbortSignals into one — aborts when either fires.
 * Returns the first signal if the second is null.
 */
export function mergeSignals(
  a: AbortSignal,
  b: AbortSignal | null
): AbortSignal {
  if (!b) return a;
  if (a.aborted || b.aborted) {
    const c = new AbortController();
    c.abort();
    return c.signal;
  }
  const merged = new AbortController();
  const abort = () => merged.abort();
  a.addEventListener('abort', abort, { once: true });
  b.addEventListener('abort', abort, { once: true });
  return merged.signal;
}
