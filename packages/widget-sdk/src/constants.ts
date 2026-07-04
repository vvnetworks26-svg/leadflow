/**
 * constants.ts
 *
 * All magic strings and default values for the SDK live here.
 * No module imports a raw string literal — always import from constants.
 * This makes refactoring safe and grep-able.
 */

// ─── Identity ─────────────────────────────────────────────────────────────────

/** Human-readable SDK name used in log prefixes. */
export const SDK_NAME = 'LeadFlow';

/** Log prefix used at the start of every console message. */
export const LOG_PREFIX = `[${SDK_NAME}]`;

/** The id attribute on the widget root <div>. */
export const ROOT_ID = 'leadflow-widget-root';

/** The property name exposed on window for the public SDK API. */
export const WINDOW_GLOBAL = '__LEADFLOW__';

// ─── Default configuration values ────────────────────────────────────────────

export const DEFAULT_POSITION     = 'bottom-right' as const;
export const DEFAULT_THEME        = 'auto'          as const;
export const DEFAULT_PRIMARY_COLOR = '#6366f1';

// ─── Event bus ────────────────────────────────────────────────────────────────

/**
 * Maximum number of event names tracked in diagnostics.eventHistorySize.
 * We track only the count, not the full event objects.
 */
export const MAX_EVENT_HISTORY_SIZE = 100;

// ─── Runtime states ───────────────────────────────────────────────────────────

/**
 * All valid runtime state identifiers.
 * Matches the RuntimeStatus union type in types.ts.
 * Defined as a const object so they can be used as values (not just types).
 */
export const RuntimeState = {
  UNINITIALIZED: 'UNINITIALIZED',
  INITIALIZING:  'INITIALIZING',
  READY:         'READY',
  DESTROYED:     'DESTROYED',
  ERROR:         'ERROR',
} as const;
