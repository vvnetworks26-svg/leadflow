/**
 * resilience/deadline.ts
 *
 * Deadline management — absolute deadlines with remaining-time calculations.
 *
 * No scheduling. No timers. Pure calculations only.
 * The ResilienceManager converts a deadline into a timeout when creating a context.
 */

import type { Deadline } from './types';

// ─── Implementation ───────────────────────────────────────────────────────────

class DeadlineImpl implements Deadline {
  readonly expiresAt: number;

  constructor(expiresAt: number) {
    this.expiresAt = expiresAt;
  }

  isExpired(): boolean {
    return Date.now() >= this.expiresAt;
  }

  remainingMs(): number {
    return Math.max(0, this.expiresAt - Date.now());
  }

  toISOString(): string {
    return new Date(this.expiresAt).toISOString();
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a deadline from an absolute timestamp (ms since epoch).
 */
export function deadlineAt(timestampMs: number): Deadline {
  return new DeadlineImpl(timestampMs);
}

/**
 * Create a deadline from a relative duration.
 * @param fromNowMs - Milliseconds from now until the deadline expires.
 */
export function deadlineIn(fromNowMs: number): Deadline {
  return new DeadlineImpl(Date.now() + fromNowMs);
}

/**
 * Returns true when the deadline has expired.
 * Safe to call with null (returns false).
 */
export function isDeadlineExpired(deadline: Deadline | null): boolean {
  return deadline ? deadline.isExpired() : false;
}

/**
 * Returns the remaining ms of the tighter of two constraints.
 * Used to pick the effective timeout when both a deadline and timeout exist.
 */
export function tighterMs(
  timeoutMs:  number,
  deadline:   Deadline | null
): number {
  if (!deadline) return timeoutMs;
  const remaining = deadline.remainingMs();
  if (timeoutMs <= 0) return remaining;
  return Math.min(timeoutMs, remaining);
}
