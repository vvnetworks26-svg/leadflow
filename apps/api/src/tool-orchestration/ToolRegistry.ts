/**
 * tool-orchestration/ToolRegistry.ts
 *
 * Single source of truth for every available business tool.
 * Adding a new tool requires only a registration entry here —
 * no orchestration logic changes.
 *
 * PURE — no I/O, no side effects.
 */

import type { ToolName } from './types';

// ─── Tool metadata ────────────────────────────────────────────────────────────

export type ToolCategory =
  | 'calendar'
  | 'crm'
  | 'booking'
  | 'lead'
  | 'knowledge'
  | 'pricing'
  | 'availability'
  | 'notification'
  | 'analytics'
  | 'escalation';

export type ExecutionMode =
  | 'sequential'     // must run after its dependencies
  | 'parallel'       // can run concurrently with unrelated tools
  | 'fire_and_forget';// non-blocking; result is not waited on

export interface RetryConfig {
  readonly maxAttempts:      number;
  readonly strategy:         'immediate' | 'exponential' | 'linear';
  readonly baseDelayMs:      number;
  readonly maxDelayMs:       number;
  readonly timeoutMs:        number;
  readonly circuitBreaker:   boolean;  // trip after N consecutive failures
  readonly circuitBreakerThreshold: number;
}

export interface CacheConfig {
  readonly cacheable:    boolean;
  readonly ttlMs:        number;      // 0 = no expiry within conversation
  readonly scope:        'conversation' | 'organization' | 'global';
  readonly keyFields:    readonly string[];  // params fields that form the cache key
}

export interface ToolDescriptor {
  readonly id:           ToolName;
  readonly category:     ToolCategory;
  readonly description:  string;
  readonly dependencies: readonly ToolName[];   // must complete before this tool
  readonly timeoutMs:    number;
  readonly retry:        RetryConfig;
  readonly cache:        CacheConfig;
  readonly executionMode:ExecutionMode;
  readonly priority:     number;                // higher = runs first within a group
  readonly idempotent:   boolean;
  readonly requiresWrite:boolean;               // true = mutates state
}

// ─── Default retry policies ───────────────────────────────────────────────────

const NO_RETRY: RetryConfig = {
  maxAttempts: 1, strategy: 'immediate', baseDelayMs: 0,
  maxDelayMs: 0, timeoutMs: 5000, circuitBreaker: false, circuitBreakerThreshold: 5,
};

const FAST_RETRY: RetryConfig = {
  maxAttempts: 2, strategy: 'immediate', baseDelayMs: 100,
  maxDelayMs: 500, timeoutMs: 3000, circuitBreaker: true, circuitBreakerThreshold: 5,
};

const BACKOFF_RETRY: RetryConfig = {
  maxAttempts: 3, strategy: 'exponential', baseDelayMs: 200,
  maxDelayMs: 2000, timeoutMs: 10000, circuitBreaker: true, circuitBreakerThreshold: 3,
};

// ─── Default cache policies ───────────────────────────────────────────────────

const NO_CACHE: CacheConfig = {
  cacheable: false, ttlMs: 0, scope: 'conversation', keyFields: [],
};

const CONV_CACHE = (keyFields: string[], ttlMs = 0): CacheConfig => ({
  cacheable: true, ttlMs, scope: 'conversation', keyFields,
});

// ─── Tool registry ────────────────────────────────────────────────────────────

const REGISTRY: Record<ToolName, ToolDescriptor> = {

  check_availability: {
    id:            'check_availability',
    category:      'availability',
    description:   'Fetch open calendar slots for the next 7 days',
    dependencies:  [],
    timeoutMs:     5000,
    retry:         FAST_RETRY,
    cache:         CONV_CACHE(['organizationId'], 5 * 60 * 1000),   // 5 min TTL
    executionMode: 'parallel',
    priority:      90,
    idempotent:    true,
    requiresWrite: false,
  },

  book_appointment: {
    id:            'book_appointment',
    category:      'booking',
    description:   'Create a confirmed appointment in the CRM',
    dependencies:  ['check_availability', 'create_lead'],
    timeoutMs:     8000,
    retry:         NO_RETRY,                // write — never auto-retry
    cache:         NO_CACHE,
    executionMode: 'sequential',
    priority:      100,
    idempotent:    false,
    requiresWrite: true,
  },

  create_lead: {
    id:            'create_lead',
    category:      'lead',
    description:   'Upsert a lead record in the CRM',
    dependencies:  [],
    timeoutMs:     5000,
    retry:         BACKOFF_RETRY,
    cache:         CONV_CACHE(['name', 'phone', 'email']),
    executionMode: 'parallel',
    priority:      80,
    idempotent:    true,
    requiresWrite: true,
  },

  update_lead: {
    id:            'update_lead',
    category:      'lead',
    description:   'Patch an existing lead record',
    dependencies:  ['create_lead'],
    timeoutMs:     5000,
    retry:         BACKOFF_RETRY,
    cache:         NO_CACHE,
    executionMode: 'sequential',
    priority:      75,
    idempotent:    true,
    requiresWrite: true,
  },

  lookup_faq: {
    id:            'lookup_faq',
    category:      'knowledge',
    description:   'Search the knowledge base for a FAQ answer',
    dependencies:  [],
    timeoutMs:     2000,
    retry:         FAST_RETRY,
    cache:         CONV_CACHE(['query'], 10 * 60 * 1000),  // 10 min TTL
    executionMode: 'parallel',
    priority:      60,
    idempotent:    true,
    requiresWrite: false,
  },

  get_estimate: {
    id:            'get_estimate',
    category:      'pricing',
    description:   'Return a rule-based price range for a service',
    dependencies:  [],
    timeoutMs:     500,
    retry:         FAST_RETRY,
    cache:         CONV_CACHE(['service', 'industry'], 30 * 60 * 1000),  // 30 min
    executionMode: 'parallel',
    priority:      50,
    idempotent:    true,
    requiresWrite: false,
  },

  send_sms: {
    id:            'send_sms',
    category:      'notification',
    description:   'Queue an SMS confirmation to the lead',
    dependencies:  ['book_appointment'],
    timeoutMs:     3000,
    retry:         NO_RETRY,
    cache:         NO_CACHE,
    executionMode: 'fire_and_forget',
    priority:      40,
    idempotent:    false,
    requiresWrite: true,
  },

  send_email: {
    id:            'send_email',
    category:      'notification',
    description:   'Queue an email confirmation to the lead',
    dependencies:  ['book_appointment'],
    timeoutMs:     3000,
    retry:         NO_RETRY,
    cache:         NO_CACHE,
    executionMode: 'fire_and_forget',
    priority:      40,
    idempotent:    false,
    requiresWrite: true,
  },

  escalate: {
    id:            'escalate',
    category:      'escalation',
    description:   'Route the conversation to a human agent',
    dependencies:  [],
    timeoutMs:     2000,
    retry:         FAST_RETRY,
    cache:         NO_CACHE,
    executionMode: 'sequential',
    priority:      110,    // highest — always runs first
    idempotent:    true,
    requiresWrite: false,
  },
};

// ─── Registry API ─────────────────────────────────────────────────────────────

export const ToolRegistry = {

  /** Get the descriptor for a tool. Throws if not registered. */
  get(name: ToolName): ToolDescriptor {
    const d = REGISTRY[name];
    if (!d) throw new Error(`Tool not registered: ${name}`);
    return d;
  },

  /** Get all registered tool names. */
  all(): ToolName[] {
    return Object.keys(REGISTRY) as ToolName[];
  },

  /** Get all tools in a category. */
  byCategory(category: ToolCategory): ToolDescriptor[] {
    return Object.values(REGISTRY).filter(d => d.category === category);
  },

  /** Check if a tool is registered. */
  has(name: string): name is ToolName {
    return name in REGISTRY;
  },

  /** Returns the timeout for a tool (ms). */
  timeoutMs(name: ToolName): number {
    return ToolRegistry.get(name).timeoutMs;
  },

  /** Returns true if a tool may run concurrently with others. */
  isParallelizable(name: ToolName): boolean {
    return ToolRegistry.get(name).executionMode === 'parallel';
  },

  /** Returns the full registry snapshot for introspection. */
  snapshot(): Readonly<Record<ToolName, ToolDescriptor>> {
    return REGISTRY;
  },
};
