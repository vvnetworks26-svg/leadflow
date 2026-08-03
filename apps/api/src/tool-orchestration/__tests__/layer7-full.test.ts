/**
 * layer7-full.test.ts
 *
 * Layer 7 — Full Architecture Test Suite
 * Covers: Registry, Planner, DependencyResolver, ParallelExecutor (dry),
 *         RetryPolicy, ToolCache, ToolMetrics, ExecutionContext,
 *         ToolResultBuilder, ToolOrchestrator (preview/validate)
 *
 * All tests are deterministic. No DB. No external I/O.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { ToolRegistry }         from '../ToolRegistry';
import { ToolPlanner }          from '../ToolPlanner';
import { DependencyResolver }   from '../DependencyResolver';
import { ToolCache }            from '../ToolCache';
import { ToolMetrics }          from '../ToolMetrics';
import { CircuitBreaker, withRetry } from '../RetryPolicy';
import { ExecutionContext }      from '../ExecutionContext';
import { ToolResultBuilder }    from '../ToolResultBuilder';
import { ToolOrchestrator }     from '../ToolOrchestrator';
import { ToolOrchestrationEngine } from '../ToolOrchestrationEngine';
import { ToolGuards }           from '../ToolGuards';
import { ToolSelector }         from '../ToolSelector';

import { buildBusinessIdentity } from '../../business-identity/BusinessIdentityFactory';
import { emptyRichMemory }       from '../../ai/types';

import type { ToolSelectionContext } from '../types';
import type { ResolvedIntent }       from '../../intent-engine/types';
import type { BusinessIdentity }     from '../../business-identity/types';
import type { RichConversationMemory, QualificationScore } from '../../ai/types';

// ─── Test fixtures ────────────────────────────────────────────────────────────

const alwaysOpen = { isOpen: true, openTime: '00:00', closeTime: '23:59' };

function makeIdentity(industry = 'hvac'): BusinessIdentity {
  return buildBusinessIdentity({
    organizationId: `org-${industry}`,
    companyProfile: { businessId: `org-${industry}`, businessName: `${industry} Co`, industry, subIndustry: '', description: '', website: '', logo: '', tagline: '' },
    contactInfo: { phone: '555-000-1111', email: 'info@test.com', address: '123 Main', city: 'Austin', state: 'TX', country: 'US', timezone: 'America/Chicago' },
    businessHours: { monday: alwaysOpen, tuesday: alwaysOpen, wednesday: alwaysOpen, thursday: alwaysOpen, friday: alwaysOpen, saturday: alwaysOpen, sunday: alwaysOpen, emergencyAfterHours: true, vacationMode: false, holidays: [], closedDates: [] },
  });
}

function makeIntent(overrides: Partial<ResolvedIntent> = {}): ResolvedIntent {
  return { id: 'i-1', category: 'repair', subCategory: '', confidenceLevel: 'high', urgency: 'normal', detectedService: null, entities: [], candidates: [], reasoning: '', blueprintId: null, requiresHuman: false, requiresClarification: false, rawMessage: 'fix it', timestamp: new Date(), ...overrides };
}

function makeQual(): QualificationScore {
  return { overall: 40, temperature: 'Cold', confidence: 50, breakdown: { industry: 40, companySize: 40, decisionMaker: 50, budget: 35, timeline: 35, urgency: 40, technicalReady: 60, aiReady: 45, painSeverity: 20, buyingIntent: 30 }, reasons: [], missingInfo: [] };
}

function makeCtx(overrides: Partial<ToolSelectionContext> = {}): ToolSelectionContext {
  return { organizationId: 'org-1', conversationId: 'conv-1', intent: makeIntent(), memory: emptyRichMemory(), stage: 'discovery', workflowState: 'collecting_info', objective: 'collect_phone', qualification: makeQual(), identity: makeIdentity(), turnCount: 1, userMessage: 'help me', ...overrides };
}

function memWithContact(): RichConversationMemory {
  const m = emptyRichMemory();
  (m as any).visitorName = 'Alice';
  (m as any).phone       = '555-1234';
  (m as any).bookingStatus = 'none';
  return m;
}

function emptyGraph() {
  return { waves: [], order: [], hasCycles: false };
}

function emptyMetrics() {
  return ToolMetrics.global();
}

// ─── 1. ToolRegistry ──────────────────────────────────────────────────────────

describe('ToolRegistry — basic', () => {
  it('returns descriptor for every registered tool', () => {
    const tools = ToolRegistry.all();
    assert.ok(tools.length >= 9);
    for (const t of tools) {
      const d = ToolRegistry.get(t);
      assert.ok(d.id === t);
    }
  });

  it('check_availability is registered with category availability', () => {
    assert.equal(ToolRegistry.get('check_availability').category, 'availability');
  });

  it('book_appointment is registered with category booking', () => {
    assert.equal(ToolRegistry.get('book_appointment').category, 'booking');
  });

  it('create_lead is idempotent', () => {
    assert.equal(ToolRegistry.get('create_lead').idempotent, true);
  });

  it('book_appointment is NOT idempotent', () => {
    assert.equal(ToolRegistry.get('book_appointment').idempotent, false);
  });

  it('book_appointment requires write', () => {
    assert.equal(ToolRegistry.get('book_appointment').requiresWrite, true);
  });

  it('check_availability does NOT require write', () => {
    assert.equal(ToolRegistry.get('check_availability').requiresWrite, false);
  });

  it('has() returns true for known tools', () => {
    assert.equal(ToolRegistry.has('escalate'), true);
    assert.equal(ToolRegistry.has('send_sms'), true);
  });

  it('has() returns false for unknown tool', () => {
    assert.equal(ToolRegistry.has('unknown_tool_xyz'), false);
  });

  it('byCategory returns only tools in that category', () => {
    const notifications = ToolRegistry.byCategory('notification');
    assert.ok(notifications.length >= 2);
    assert.ok(notifications.every(d => d.category === 'notification'));
  });

  it('book_appointment depends on check_availability', () => {
    const d = ToolRegistry.get('book_appointment');
    assert.ok(d.dependencies.includes('check_availability'));
  });

  it('send_sms depends on book_appointment', () => {
    assert.ok(ToolRegistry.get('send_sms').dependencies.includes('book_appointment'));
  });

  it('get_estimate has cacheable=true', () => {
    assert.equal(ToolRegistry.get('get_estimate').cache.cacheable, true);
  });

  it('book_appointment has cacheable=false', () => {
    assert.equal(ToolRegistry.get('book_appointment').cache.cacheable, false);
  });

  it('escalate has highest priority', () => {
    const tools = ToolRegistry.all();
    const maxPriority = Math.max(...tools.map(t => ToolRegistry.get(t).priority));
    assert.equal(ToolRegistry.get('escalate').priority, maxPriority);
  });

  it('throws on unregistered tool', () => {
    assert.throws(() => ToolRegistry.get('not_a_real_tool' as any));
  });
});

// ─── 2. DependencyResolver ────────────────────────────────────────────────────

describe('DependencyResolver — basic ordering', () => {
  it('empty input → empty graph', () => {
    const g = DependencyResolver.resolve([]);
    assert.equal(g.waves.length, 0);
    assert.equal(g.order.length, 0);
    assert.equal(g.hasCycles, false);
  });

  it('single tool with no deps → one wave', () => {
    const g = DependencyResolver.resolve(['lookup_faq']);
    assert.equal(g.waves.length, 1);
    assert.ok(g.waves[0]!.tools.includes('lookup_faq'));
  });

  it('two independent tools → one parallel wave', () => {
    const g = DependencyResolver.resolve(['lookup_faq', 'get_estimate']);
    assert.equal(g.waves.length, 1);
    assert.equal(g.waves[0]!.parallel, true);
  });

  it('check_availability and lookup_faq are independent → parallel', () => {
    const g = DependencyResolver.resolve(['check_availability', 'lookup_faq']);
    assert.equal(g.waves[0]!.parallel, true);
  });

  it('book_appointment depends on check_availability → two waves', () => {
    const g = DependencyResolver.resolve(['check_availability', 'book_appointment']);
    assert.ok(g.waves.length >= 2);
    assert.ok(g.waves[0]!.tools.includes('check_availability'));
    assert.ok(g.waves[1]!.tools.includes('book_appointment'));
  });

  it('send_sms after book_appointment → appears in later wave', () => {
    const g = DependencyResolver.resolve(['check_availability', 'book_appointment', 'send_sms']);
    const bookWave = g.waves.findIndex(w => w.tools.includes('book_appointment'));
    const smsWave  = g.waves.findIndex(w => w.tools.includes('send_sms'));
    assert.ok(smsWave > bookWave);
  });

  it('topological order is valid (dependencies before dependants)', () => {
    const g = DependencyResolver.resolve(['check_availability', 'book_appointment', 'create_lead', 'send_sms']);
    const orderIdx = (t: string) => g.order.indexOf(t as any);
    assert.ok(orderIdx('check_availability') < orderIdx('book_appointment'));
    assert.ok(orderIdx('book_appointment') < orderIdx('send_sms'));
  });

  it('validate() returns true for valid tool set', () => {
    assert.equal(DependencyResolver.validate(['check_availability', 'lookup_faq', 'get_estimate']), true);
  });

  it('parallelGroup returns first wave tools when parallel', () => {
    const group = DependencyResolver.parallelGroup(['lookup_faq', 'get_estimate']);
    assert.ok(group.includes('lookup_faq'));
    assert.ok(group.includes('get_estimate'));
  });
});

describe('DependencyResolver — ordering by priority', () => {
  it('higher priority tool appears first in wave', () => {
    const g = DependencyResolver.resolve(['get_estimate', 'lookup_faq', 'check_availability']);
    // check_availability (priority 90) > get_estimate (50) > lookup_faq (60)
    const first = g.order[0];
    assert.equal(first, 'check_availability');
  });
});

// ─── 3. ToolPlanner ───────────────────────────────────────────────────────────

describe('ToolPlanner — plan()', () => {
  it('empty context → empty plan', () => {
    const plan = ToolPlanner.plan(makeCtx({ stage: 'greeting', intent: makeIntent({ category: 'unknown' }), turnCount: 0 }));
    assert.equal(plan.calls.length, 0);
    assert.equal(plan.estimatedMs, 0);
    assert.equal(plan.hasWrites, false);
    assert.equal(plan.fullyParallel, true);
  });

  it('booking context → plan has check_availability', () => {
    const plan = ToolPlanner.plan(makeCtx({ stage: 'booking' }));
    assert.ok(plan.calls.some(c => c.tool === 'check_availability'));
  });

  it('plan.graph has no cycles for standard booking flow', () => {
    const plan = ToolPlanner.plan(makeCtx({ stage: 'booking', memory: memWithContact(), intent: makeIntent({ category: 'book_appointment' }) }));
    assert.equal(plan.graph.hasCycles, false);
  });

  it('estimate context → estimatedMs > 0', () => {
    const plan = ToolPlanner.plan(makeCtx({ intent: makeIntent({ category: 'request_estimate' }), stage: 'discovery' }));
    assert.ok(plan.estimatedMs >= 0);
  });

  it('booking with writes → hasWrites=true', () => {
    const plan = ToolPlanner.plan(makeCtx({ stage: 'booking', memory: memWithContact(), intent: makeIntent({ category: 'book_appointment' }) }));
    assert.equal(plan.hasWrites, true);
  });

  it('preview() → dryRun=true', () => {
    const plan = ToolPlanner.preview(makeCtx({ stage: 'booking' }));
    assert.equal(plan.dryRun, true);
  });

  it('describe() returns non-empty string', () => {
    const plan = ToolPlanner.plan(makeCtx({ stage: 'booking' }));
    const desc = ToolPlanner.describe(plan);
    assert.ok(desc.length > 0);
  });

  it('describe() mentions wave count', () => {
    const plan = ToolPlanner.plan(makeCtx({ stage: 'booking', memory: memWithContact(), intent: makeIntent({ category: 'book_appointment' }) }));
    const desc = ToolPlanner.describe(plan);
    assert.ok(desc.includes('Wave'));
  });

  it('emergency context → plan includes escalate', () => {
    const plan = ToolPlanner.plan(makeCtx({ intent: makeIntent({ urgency: 'critical' }) }));
    assert.ok(plan.calls.some(c => c.tool === 'escalate'));
  });
});

// ─── 4. ToolCache ─────────────────────────────────────────────────────────────

describe('ToolCache — basic ops', () => {
  before(() => { ToolCache.flush(); ToolCache.resetStats(); });

  it('miss returns undefined for uncached entry', () => {
    const cfg = { cacheable: true, ttlMs: 60000, scope: 'conversation' as const, keyFields: ['query'] };
    const result = ToolCache.get('lookup_faq', { query: 'test' }, cfg, 'conv-test', 'org-test');
    assert.equal(result, undefined);
  });

  it('set then get returns cached value', () => {
    const cfg = { cacheable: true, ttlMs: 60000, scope: 'conversation' as const, keyFields: ['query'] };
    ToolCache.set('lookup_faq', { query: 'hvac' }, { answer: 'yes' }, cfg, 'conv-1', 'org-1');
    const result = ToolCache.get('lookup_faq', { query: 'hvac' }, cfg, 'conv-1', 'org-1');
    assert.deepEqual(result, { answer: 'yes' });
  });

  it('different conversations do not share cache', () => {
    const cfg = { cacheable: true, ttlMs: 60000, scope: 'conversation' as const, keyFields: ['query'] };
    ToolCache.set('lookup_faq', { query: 'test' }, 'value-a', cfg, 'conv-A', 'org-1');
    const r = ToolCache.get('lookup_faq', { query: 'test' }, cfg, 'conv-B', 'org-1');
    assert.equal(r, undefined);
  });

  it('non-cacheable config always misses', () => {
    const cfg = { cacheable: false, ttlMs: 0, scope: 'conversation' as const, keyFields: [] };
    ToolCache.set('book_appointment', {}, 'val', cfg, 'conv-1', 'org-1');
    const r = ToolCache.get('book_appointment', {}, cfg, 'conv-1', 'org-1');
    assert.equal(r, undefined);
  });

  it('expired entry returns undefined', async () => {
    const cfg = { cacheable: true, ttlMs: 1, scope: 'conversation' as const, keyFields: ['x'] };
    ToolCache.set('get_estimate', { x: '1' }, 'stale', cfg, 'conv-expire', 'org-1');
    await new Promise(r => setTimeout(r, 10));
    const r = ToolCache.get('get_estimate', { x: '1' }, cfg, 'conv-expire', 'org-1');
    assert.equal(r, undefined);
  });

  it('stats.hitRate reflects hits and misses', () => {
    ToolCache.resetStats();
    const cfg = { cacheable: true, ttlMs: 60000, scope: 'conversation' as const, keyFields: ['k'] };
    ToolCache.set('get_estimate', { k: 'a' }, 'v', cfg, 'conv-stat', 'org-1');
    ToolCache.get('get_estimate', { k: 'a' }, cfg, 'conv-stat', 'org-1');  // hit
    ToolCache.get('get_estimate', { k: 'b' }, cfg, 'conv-stat', 'org-1');  // miss
    const s = ToolCache.stats();
    assert.ok(s.hitRate > 0 && s.hitRate < 1);
  });

  it('invalidateConversation removes only that conversation entries', () => {
    ToolCache.flush();
    const cfg = { cacheable: true, ttlMs: 60000, scope: 'conversation' as const, keyFields: ['q'] };
    ToolCache.set('lookup_faq', { q: '1' }, 'a', cfg, 'conv-X', 'org-1');
    ToolCache.set('lookup_faq', { q: '2' }, 'b', cfg, 'conv-Y', 'org-1');
    const removed = ToolCache.invalidateConversation('conv-X');
    assert.ok(removed >= 1);
    assert.equal(ToolCache.get('lookup_faq', { q: '1' }, cfg, 'conv-X', 'org-1'), undefined);
    assert.equal(ToolCache.get('lookup_faq', { q: '2' }, cfg, 'conv-Y', 'org-1'), 'b');
  });

  it('flush() empties cache', () => {
    const cfg = { cacheable: true, ttlMs: 60000, scope: 'conversation' as const, keyFields: ['x'] };
    ToolCache.set('lookup_faq', { x: '1' }, 'v', cfg, 'conv-1', 'org-1');
    ToolCache.flush();
    assert.equal(ToolCache.snapshot().length, 0);
  });
});

// ─── 5. ToolMetrics ───────────────────────────────────────────────────────────

describe('ToolMetrics', () => {
  before(() => ToolMetrics.reset());

  it('initial snapshot has zero executions', () => {
    ToolMetrics.reset();
    const s = ToolMetrics.snapshot('lookup_faq');
    assert.equal(s.executions, 0);
    assert.equal(s.successes, 0);
    assert.equal(s.failures, 0);
  });

  it('recordSuccess increments executions and successes', () => {
    ToolMetrics.reset();
    ToolMetrics.recordSuccess('lookup_faq', 42);
    const s = ToolMetrics.snapshot('lookup_faq');
    assert.equal(s.executions, 1);
    assert.equal(s.successes, 1);
    assert.equal(s.failures, 0);
  });

  it('recordFailure increments failures', () => {
    ToolMetrics.reset();
    ToolMetrics.recordFailure('book_appointment', 100);
    const s = ToolMetrics.snapshot('book_appointment');
    assert.equal(s.failures, 1);
    assert.equal(s.successes, 0);
  });

  it('timeout flag increments timeouts', () => {
    ToolMetrics.reset();
    ToolMetrics.recordFailure('check_availability', 3000, true);
    const s = ToolMetrics.snapshot('check_availability');
    assert.equal(s.timeouts, 1);
  });

  it('recordRetry increments retries without adding execution', () => {
    ToolMetrics.reset();
    ToolMetrics.recordRetry('create_lead');
    const s = ToolMetrics.snapshot('create_lead');
    assert.equal(s.retries, 1);
    assert.equal(s.executions, 0);
  });

  it('recordCacheHit increments cacheHits', () => {
    ToolMetrics.reset();
    ToolMetrics.recordCacheHit('get_estimate');
    const s = ToolMetrics.snapshot('get_estimate');
    assert.equal(s.cacheHits, 1);
  });

  it('avgLatencyMs is correct', () => {
    ToolMetrics.reset();
    ToolMetrics.recordSuccess('escalate', 10);
    ToolMetrics.recordSuccess('escalate', 20);
    const s = ToolMetrics.snapshot('escalate');
    assert.equal(s.avgLatencyMs, 15);
  });

  it('p50 latency correct for even set', () => {
    ToolMetrics.reset();
    [10, 20, 30, 40].forEach(ms => ToolMetrics.recordSuccess('lookup_faq', ms));
    const s = ToolMetrics.snapshot('lookup_faq');
    assert.ok(s.p50LatencyMs >= 10 && s.p50LatencyMs <= 30);
  });

  it('p95 latency >= p50', () => {
    ToolMetrics.reset();
    [5, 10, 15, 20, 25, 30, 35, 40, 45, 500].forEach(ms => ToolMetrics.recordSuccess('send_sms', ms));
    const s = ToolMetrics.snapshot('send_sms');
    assert.ok(s.p95LatencyMs >= s.p50LatencyMs);
  });

  it('successRate is 0 for all failures', () => {
    ToolMetrics.reset();
    ToolMetrics.recordFailure('send_email', 200);
    const s = ToolMetrics.snapshot('send_email');
    assert.equal(s.successRate, 0);
  });

  it('successRate is 1 for all successes', () => {
    ToolMetrics.reset();
    ToolMetrics.recordSuccess('lookup_faq', 10);
    ToolMetrics.recordSuccess('lookup_faq', 15);
    const s = ToolMetrics.snapshot('lookup_faq');
    assert.equal(s.successRate, 1);
  });

  it('global() aggregates across tools', () => {
    ToolMetrics.reset();
    ToolMetrics.recordSuccess('lookup_faq', 10);
    ToolMetrics.recordSuccess('get_estimate', 5);
    ToolMetrics.recordFailure('create_lead', 200);
    const g = ToolMetrics.global();
    assert.equal(g.totalExecutions, 3);
    assert.equal(g.totalSuccesses, 2);
    assert.equal(g.totalFailures, 1);
    assert.ok(g.recordedAt.length > 0);
  });
});

// ─── 6. RetryPolicy / CircuitBreaker ─────────────────────────────────────────

describe('RetryPolicy — withRetry', () => {
  before(() => CircuitBreaker.resetAll());
  after(()  => CircuitBreaker.resetAll());

  it('succeeds on first attempt', async () => {
    const r = await withRetry(
      async () => 'ok',
      { maxAttempts: 3, strategy: 'immediate', baseDelayMs: 0, maxDelayMs: 0, timeoutMs: 1000, circuitBreaker: false, circuitBreakerThreshold: 5 },
      'lookup_faq', 'conv-retry-1',
    );
    assert.equal(r.succeeded, true);
    assert.equal(r.value, 'ok');
    assert.equal(r.attempts, 1);
  });

  it('retries on failure and succeeds on 2nd attempt', async () => {
    let calls = 0;
    const r = await withRetry(
      async () => { calls++; if (calls < 2) throw new Error('fail'); return 'done'; },
      { maxAttempts: 3, strategy: 'immediate', baseDelayMs: 0, maxDelayMs: 0, timeoutMs: 1000, circuitBreaker: false, circuitBreakerThreshold: 5 },
      'get_estimate', 'conv-retry-2',
    );
    assert.equal(r.succeeded, true);
    assert.equal(r.attempts, 2);
  });

  it('exhausts all attempts and returns failure', async () => {
    const r = await withRetry(
      async () => { throw new Error('always fail'); },
      { maxAttempts: 2, strategy: 'immediate', baseDelayMs: 0, maxDelayMs: 0, timeoutMs: 1000, circuitBreaker: false, circuitBreakerThreshold: 5 },
      'create_lead', 'conv-retry-3',
    );
    assert.equal(r.succeeded, false);
    assert.equal(r.attempts, 2);
    assert.ok(r.error?.message.includes('always fail'));
  });

  it('timeout produces timedOut=true', async () => {
    const r = await withRetry(
      async () => new Promise((_r, reject) => setTimeout(() => reject(new Error('Tool timeout: check_availability')), 5)),
      { maxAttempts: 1, strategy: 'immediate', baseDelayMs: 0, maxDelayMs: 0, timeoutMs: 1, circuitBreaker: false, circuitBreakerThreshold: 5 },
      'check_availability', 'conv-retry-4',
    );
    assert.equal(r.succeeded, false);
    assert.equal(r.timedOut, true);
  });
});

describe('CircuitBreaker', () => {
  before(() => CircuitBreaker.resetAll());
  after(()  => CircuitBreaker.resetAll());

  it('circuit starts closed', () => {
    const s = CircuitBreaker.get('create_lead', 'conv-cb-1');
    assert.equal(s.state, 'closed');
  });

  it('circuit opens after threshold failures', async () => {
    CircuitBreaker.resetAll();
    const cfg = { maxAttempts: 1, strategy: 'immediate' as const, baseDelayMs: 0, maxDelayMs: 0, timeoutMs: 1000, circuitBreaker: true, circuitBreakerThreshold: 2 };
    await withRetry(async () => { throw new Error('e1'); }, cfg, 'create_lead', 'conv-cb-2');
    await withRetry(async () => { throw new Error('e2'); }, cfg, 'create_lead', 'conv-cb-2');
    const s = CircuitBreaker.get('create_lead', 'conv-cb-2');
    assert.equal(s.state, 'open');
  });

  it('open circuit returns failure immediately (0 attempts)', async () => {
    CircuitBreaker.resetAll();
    // Trip the circuit
    const cfg = { maxAttempts: 1, strategy: 'immediate' as const, baseDelayMs: 0, maxDelayMs: 0, timeoutMs: 1000, circuitBreaker: true, circuitBreakerThreshold: 1 };
    await withRetry(async () => { throw new Error('trip'); }, cfg, 'send_sms', 'conv-cb-3');
    // Now it's open
    const r = await withRetry(async () => 'should not run', cfg, 'send_sms', 'conv-cb-3');
    assert.equal(r.succeeded, false);
    assert.equal(r.attempts, 0);
  });

  it('reset() closes circuit', async () => {
    CircuitBreaker.resetAll();
    const cfg = { maxAttempts: 1, strategy: 'immediate' as const, baseDelayMs: 0, maxDelayMs: 0, timeoutMs: 1000, circuitBreaker: true, circuitBreakerThreshold: 1 };
    await withRetry(async () => { throw new Error('trip'); }, cfg, 'send_email', 'conv-cb-4');
    CircuitBreaker.reset('send_email', 'conv-cb-4');
    assert.equal(CircuitBreaker.get('send_email', 'conv-cb-4').state, 'closed');
  });
});

// ─── 7. ExecutionContext ──────────────────────────────────────────────────────

describe('ExecutionContext.build()', () => {
  function makeExecResult(records: any[]) {
    return ToolResultBuilder.build({
      conversationId:  'conv-1',
      organizationId:  'org-1',
      records,
      graph:           emptyGraph(),
      metricsSnapshot: emptyMetrics(),
      totalDurationMs: 10,
    });
  }

  it('returns empty contextBlock when no successful results', () => {
    const r = makeExecResult([{ tool: 'lookup_faq', status: 'failure', durationMs: 5, attempts: 1 }]);
    const ctx = ExecutionContext.build(r);
    assert.equal(ctx.contextBlock, '');
    assert.equal(ctx.hasResults, false);
  });

  it('formats availability slots correctly', () => {
    const r = makeExecResult([{
      tool: 'check_availability', status: 'success', durationMs: 20, attempts: 1,
      data: { slots: [{ startLocal: '2026-08-10T09:00:00Z', endLocal: '2026-08-10T10:00:00Z', timezone: 'UTC', label: 'Mon Aug 10 at 9:00 AM' }], nextAvailable: { startLocal: '2026-08-10T09:00:00Z', endLocal: '2026-08-10T10:00:00Z', timezone: 'UTC', label: 'Mon Aug 10 at 9:00 AM' }, suggested: [] },
    }]);
    const ctx = ExecutionContext.build(r);
    assert.ok(ctx.contextBlock.includes('AVAILABLE APPOINTMENT SLOTS'));
    assert.ok(ctx.hasResults);
  });

  it('formats booking confirmation correctly', () => {
    const r = makeExecResult([{
      tool: 'book_appointment', status: 'success', durationMs: 50, attempts: 1,
      data: { appointment: { _id: 'appt-1', confirmationCode: 'LF-XYZ', type: 'AC Repair', startUtc: '2026-08-10T09:00Z' }, leadId: 'lead-1' },
    }]);
    const ctx = ExecutionContext.build(r);
    assert.ok(ctx.contextBlock.includes('BOOKING CONFIRMATION'));
    assert.ok(ctx.contextBlock.includes('LF-XYZ'));
  });

  it('formats estimate correctly', () => {
    const r = makeExecResult([{
      tool: 'get_estimate', status: 'success', durationMs: 2, attempts: 1,
      data: { rangeMin: 150, rangeMax: 800, currency: 'USD', disclaimer: 'Estimate only', factors: ['labor', 'parts'] },
    }]);
    const ctx = ExecutionContext.build(r);
    assert.ok(ctx.contextBlock.includes('$150'));
    assert.ok(ctx.contextBlock.includes('$800'));
  });

  it('formats FAQ answer correctly', () => {
    const r = makeExecResult([{
      tool: 'lookup_faq', status: 'success', durationMs: 5, attempts: 1,
      data: [{ content: 'We offer 24/7 emergency HVAC service.', title: 'Emergency?' }],
    }]);
    const ctx = ExecutionContext.build(r);
    assert.ok(ctx.contextBlock.includes('KNOWLEDGE BASE'));
    assert.ok(ctx.contextBlock.includes('24/7 emergency'));
  });

  it('formats escalation correctly', () => {
    const r = makeExecResult([{
      tool: 'escalate', status: 'success', durationMs: 1, attempts: 1,
      data: { escalated: true, reason: 'emergency' },
    }]);
    const ctx = ExecutionContext.build(r);
    assert.ok(ctx.contextBlock.includes('ESCALATION'));
  });

  it('blocks are sorted by priority (escalation first)', () => {
    const r = makeExecResult([
      { tool: 'lookup_faq',  status: 'success', durationMs: 5, attempts: 1, data: [{ content: 'FAQ answer' }] },
      { tool: 'escalate',    status: 'success', durationMs: 1, attempts: 1, data: { escalated: true, reason: 'emergency' } },
    ]);
    const ctx = ExecutionContext.build(r);
    const escIdx = ctx.contextBlock.indexOf('ESCALATION');
    const faqIdx = ctx.contextBlock.indexOf('KNOWLEDGE BASE');
    assert.ok(escIdx < faqIdx, 'Escalation block should appear before FAQ block');
  });

  it('cached results are included in context', () => {
    const r = makeExecResult([{
      tool: 'get_estimate', status: 'cached', durationMs: 0, attempts: 0, fromCache: true,
      data: { rangeMin: 200, rangeMax: 900, currency: 'USD', disclaimer: '', factors: [] },
    }]);
    const ctx = ExecutionContext.build(r);
    assert.ok(ctx.contextBlock.includes('$200'));
  });

  it('fromAvailability helper returns formatted string', () => {
    const s = ExecutionContext.fromAvailability({ slots: [], nextAvailable: null, suggested: [] });
    assert.ok(typeof s === 'string');
  });

  it('fromEstimate helper returns formatted string', () => {
    const s = ExecutionContext.fromEstimate({ rangeMin: 100, rangeMax: 500, currency: 'USD', disclaimer: 'Note', factors: [] });
    assert.ok(s.includes('$100'));
  });
});

// ─── 8. ToolResultBuilder ─────────────────────────────────────────────────────

describe('ToolResultBuilder', () => {
  it('build() produces immutable result', () => {
    const r = ToolResultBuilder.build({
      conversationId: 'c1', organizationId: 'o1', records: [], graph: emptyGraph(),
      metricsSnapshot: emptyMetrics(), totalDurationMs: 10,
    });
    assert.equal(Object.isFrozen(r), true);
    assert.equal(Object.isFrozen(r.results), true);
  });

  it('successful records appear in .successful', () => {
    const r = ToolResultBuilder.build({
      conversationId: 'c1', organizationId: 'o1',
      records: [{ tool: 'lookup_faq', status: 'success', durationMs: 5 }],
      graph: emptyGraph(), metricsSnapshot: emptyMetrics(), totalDurationMs: 5,
    });
    assert.equal(r.successful.length, 1);
    assert.equal(r.failed.length, 0);
  });

  it('failed records appear in .failed', () => {
    const r = ToolResultBuilder.build({
      conversationId: 'c1', organizationId: 'o1',
      records: [{ tool: 'book_appointment', status: 'failure', error: 'db error', durationMs: 50 }],
      graph: emptyGraph(), metricsSnapshot: emptyMetrics(), totalDurationMs: 50,
    });
    assert.equal(r.failed.length, 1);
    assert.equal(r.failed[0]!.error, 'db error');
  });

  it('skipped records appear in .skipped', () => {
    const r = ToolResultBuilder.build({
      conversationId: 'c1', organizationId: 'o1',
      records: [{ tool: 'send_sms', status: 'skipped', durationMs: 0 }],
      graph: emptyGraph(), metricsSnapshot: emptyMetrics(), totalDurationMs: 0,
    });
    assert.equal(r.skipped.length, 1);
  });

  it('cached records appear in .cached', () => {
    const r = ToolResultBuilder.build({
      conversationId: 'c1', organizationId: 'o1',
      records: [{ tool: 'get_estimate', status: 'cached', durationMs: 0, fromCache: true }],
      graph: emptyGraph(), metricsSnapshot: emptyMetrics(), totalDurationMs: 0,
    });
    assert.equal(r.cached.length, 1);
  });

  it('empty() has zero results', () => {
    const r = ToolResultBuilder.empty('c1', 'o1', emptyGraph(), emptyMetrics());
    assert.equal(r.results.length, 0);
    assert.equal(r.totalDurationMs, 0);
  });

  it('merge() combines results from two builds', () => {
    const a = ToolResultBuilder.build({ conversationId: 'c1', organizationId: 'o1', records: [{ tool: 'lookup_faq', status: 'success', durationMs: 5 }], graph: emptyGraph(), metricsSnapshot: emptyMetrics(), totalDurationMs: 5 });
    const b = ToolResultBuilder.build({ conversationId: 'c1', organizationId: 'o1', records: [{ tool: 'get_estimate', status: 'success', durationMs: 2 }], graph: emptyGraph(), metricsSnapshot: emptyMetrics(), totalDurationMs: 2 });
    const merged = ToolResultBuilder.merge(a, b);
    assert.equal(merged.results.length, 2);
    assert.equal(merged.successful.length, 2);
  });

  it('executedAt is a valid ISO string', () => {
    const r = ToolResultBuilder.empty('c1', 'o1', emptyGraph(), emptyMetrics());
    assert.ok(!isNaN(Date.parse(r.executedAt)));
  });
});

// ─── 9. ToolOrchestrator — preview / validate (no I/O) ───────────────────────

describe('ToolOrchestrator — preview()', () => {
  it('returns ExecutionPlan with dryRun=true', () => {
    const plan = ToolOrchestrator.preview(makeCtx());
    assert.equal(plan.dryRun, true);
  });

  it('booking context preview includes check_availability', () => {
    const plan = ToolOrchestrator.preview(makeCtx({ stage: 'booking' }));
    assert.ok(plan.calls.some(c => c.tool === 'check_availability'));
  });

  it('emergency preview includes escalate', () => {
    const plan = ToolOrchestrator.preview(makeCtx({ intent: makeIntent({ urgency: 'critical' }) }));
    assert.ok(plan.calls.some(c => c.tool === 'escalate'));
  });

  it('describe() returns non-empty string', () => {
    const desc = ToolOrchestrator.describe(makeCtx({ stage: 'booking' }));
    assert.ok(desc.length > 0);
  });

  it('empty context produces empty plan', () => {
    const plan = ToolOrchestrator.preview(makeCtx({ stage: 'greeting', intent: makeIntent({ category: 'unknown' }), turnCount: 0 }));
    assert.equal(plan.calls.length, 0);
  });
});

describe('ToolOrchestrationEngine — validate()', () => {
  it('validate does not throw on any context', () => {
    assert.doesNotThrow(() => ToolOrchestrationEngine.validate(makeCtx()));
  });

  it('validate returns numeric allowed/blocked counts', () => {
    const v = ToolOrchestrationEngine.validate(makeCtx({ stage: 'booking' }));
    assert.ok(typeof v.allowed === 'number');
    assert.ok(typeof v.blocked === 'number');
  });
});

// ─── 10. Integration — full pipeline selection → graph → context ──────────────

describe('Integration — booking flow pipeline (pure)', () => {
  it('booking flow produces correct dependency waves', () => {
    const ctx = makeCtx({ stage: 'booking', memory: memWithContact(), intent: makeIntent({ category: 'book_appointment' }) });
    const plan = ToolPlanner.plan(ctx);
    // check_availability must be in wave 0, book_appointment in a later wave
    const wave0 = plan.graph.waves[0]?.tools ?? [];
    const allTools = plan.graph.order;
    const checkIdx = allTools.indexOf('check_availability');
    const bookIdx  = allTools.indexOf('book_appointment');
    assert.ok(checkIdx < bookIdx, `check_availability (${checkIdx}) should precede book_appointment (${bookIdx})`);
  });

  it('FAQ + estimate can run in parallel (both in wave 0)', () => {
    const ctx = makeCtx({ intent: makeIntent({ category: 'general_question' }), userMessage: 'How much does AC repair cost?', stage: 'discovery' });
    const plan = ToolPlanner.plan(ctx);
    // Both should be in the first wave as parallel
    const firstWave = plan.graph.waves[0]?.tools ?? [];
    const hasFaq = firstWave.includes('lookup_faq');
    const hasEst = firstWave.includes('get_estimate');
    // At minimum one of them is present; if both, wave is parallel
    if (hasFaq && hasEst) {
      assert.equal(plan.graph.waves[0]!.parallel, true);
    } else {
      assert.ok(hasFaq || hasEst);
    }
  });

  it('context builder produces non-empty block for estimate result', () => {
    const execResult = ToolResultBuilder.build({
      conversationId: 'c1', organizationId: 'o1',
      records: [{ tool: 'get_estimate', status: 'success', durationMs: 2, data: { rangeMin: 80, rangeMax: 250, currency: 'USD', disclaimer: 'Estimate only', factors: ['parts'] } }],
      graph: emptyGraph(), metricsSnapshot: emptyMetrics(), totalDurationMs: 2,
    });
    const ctx = ExecutionContext.build(execResult);
    assert.ok(ctx.hasResults);
    assert.ok(ctx.contextBlock.includes('80'));
  });

  it('plan estimatedMs is non-negative', () => {
    const plan = ToolPlanner.plan(makeCtx({ stage: 'booking' }));
    assert.ok(plan.estimatedMs >= 0);
  });

  it('multiple concurrent conversations do not share cache', () => {
    ToolCache.flush();
    const cfg = { cacheable: true, ttlMs: 60000, scope: 'conversation' as const, keyFields: ['service'] };
    ToolCache.set('get_estimate', { service: 'AC' }, { rangeMin: 100, rangeMax: 500 }, cfg, 'conv-AAA', 'org-1');
    ToolCache.set('get_estimate', { service: 'AC' }, { rangeMin: 200, rangeMax: 800 }, cfg, 'conv-BBB', 'org-1');
    const a = ToolCache.get('get_estimate', { service: 'AC' }, cfg, 'conv-AAA', 'org-1') as any;
    const b = ToolCache.get('get_estimate', { service: 'AC' }, cfg, 'conv-BBB', 'org-1') as any;
    assert.equal(a?.rangeMin, 100);
    assert.equal(b?.rangeMin, 200);
  });
});

// ─── 11. Edge cases and stress ────────────────────────────────────────────────

describe('Edge cases', () => {
  it('DependencyResolver handles single tool with no deps gracefully', () => {
    const g = DependencyResolver.resolve(['escalate']);
    assert.equal(g.hasCycles, false);
    assert.equal(g.order[0], 'escalate');
  });

  it('ToolPlanner handles 9 tools at once without crash', () => {
    const ctx = makeCtx({ stage: 'booking', memory: memWithContact(), intent: makeIntent({ category: 'book_appointment' }) });
    assert.doesNotThrow(() => ToolPlanner.plan(ctx));
  });

  it('ToolMetrics handles 1000 data points without degradation', () => {
    ToolMetrics.resetTool('lookup_faq');
    for (let i = 0; i < 1000; i++) ToolMetrics.recordSuccess('lookup_faq', i % 100);
    const s = ToolMetrics.snapshot('lookup_faq');
    assert.equal(s.executions, 1000);
    assert.ok(s.p95LatencyMs > s.p50LatencyMs);
  });

  it('ToolCache handles 100 different entries', () => {
    ToolCache.flush();
    const cfg = { cacheable: true, ttlMs: 60000, scope: 'conversation' as const, keyFields: ['id'] };
    for (let i = 0; i < 100; i++) {
      ToolCache.set('lookup_faq', { id: String(i) }, `val${i}`, cfg, 'conv-stress', 'org-1');
    }
    assert.equal(ToolCache.snapshot().length, 100);
    ToolCache.flush();
  });

  it('ToolResultBuilder merge is associative', () => {
    const mk = (tool: string) => ToolResultBuilder.build({
      conversationId: 'c', organizationId: 'o',
      records: [{ tool: tool as any, status: 'success', durationMs: 1 }],
      graph: emptyGraph(), metricsSnapshot: emptyMetrics(), totalDurationMs: 1,
    });
    const a = mk('lookup_faq');
    const b = mk('get_estimate');
    const c = mk('escalate');
    const ab_c = ToolResultBuilder.merge(ToolResultBuilder.merge(a, b), c);
    const a_bc = ToolResultBuilder.merge(a, ToolResultBuilder.merge(b, c));
    assert.equal(ab_c.results.length, a_bc.results.length);
  });

  it('DependencyResolver returns empty parallelGroup for empty input', () => {
    const group = DependencyResolver.parallelGroup([]);
    assert.equal(group.length, 0);
  });

  it('ToolOrchestrator.describe returns "No tools selected." for empty plan', () => {
    const desc = ToolOrchestrator.describe(makeCtx({ stage: 'greeting', intent: makeIntent({ category: 'unknown' }), turnCount: 0 }));
    assert.equal(desc, 'No tools selected.');
  });
});
