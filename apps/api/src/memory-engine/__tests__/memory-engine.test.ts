/**
 * memory-engine/__tests__/memory-engine.test.ts
 * Run: npx tsx src/memory-engine/__tests__/memory-engine.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { MemoryEngine }           from '../MemoryEngine';
import { buildMemoryItem }        from '../MemoryScorer';
import { classifyField, classifyAllFields } from '../MemoryClassifier';
import { scoreImportance, toImportanceLevel } from '../MemoryImportance';
import { assignRetention }        from '../MemoryRetention';
import { resolveConflict }        from '../MemoryConflictResolver';
import { isExpired, filterActive, expiresAt } from '../MemoryTimeline';
import { compressMemory }         from '../MemoryCompressor';
import { summarizeMemory }        from '../MemorySummarizer';
import { retrieveForContext, findLowConfidence } from '../MemoryRetriever';
import { buildMemoryProfile }     from '../MemoryProfile';
import { emptyRichMemory }        from '../../ai/types';
import type { MemoryItem }        from '../MemoryTypes';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function item(key: string, value: unknown, confidence = 80, source: MemoryItem['source'] = 'context'): MemoryItem {
  return buildMemoryItem({ key, value, confidence, source });
}

// ─── MemoryClassifier ─────────────────────────────────────────────────────────

describe('MemoryClassifier', () => {
  it('classifies visitorName as identity',    () => assert.equal(classifyField('visitorName'), 'identity'));
  it('classifies phone as identity',          () => assert.equal(classifyField('phone'), 'identity'));
  it('classifies email as identity',          () => assert.equal(classifyField('email'), 'identity'));
  it('classifies address as property',        () => assert.equal(classifyField('address'), 'property'));
  it('classifies zip as property',            () => assert.equal(classifyField('zip'), 'property'));
  it('classifies company as business',        () => assert.equal(classifyField('company'), 'business'));
  it('classifies budget as business',         () => assert.equal(classifyField('budget'), 'business'));
  it('classifies painPoints as behavioral',   () => assert.equal(classifyField('painPoints'), 'behavioral'));
  it('classifies objections as relationship', () => assert.equal(classifyField('objections'), 'relationship'));
  it('classifies service as preference',      () => assert.equal(classifyField('service'), 'preference'));
  it('unknown field defaults to behavioral',  () => assert.equal(classifyField('unknownXYZ'), 'behavioral'));

  it('classifyAllFields returns correct map', () => {
    const map = classifyAllFields(['phone', 'company', 'painPoints']);
    assert.equal(map.phone, 'identity');
    assert.equal(map.company, 'business');
    assert.equal(map.painPoints, 'behavioral');
  });
});

// ─── MemoryImportance ─────────────────────────────────────────────────────────

describe('MemoryImportance', () => {
  it('phone scores >= 90',        () => assert.ok(scoreImportance('phone', 90) >= 90));
  it('bookingStatus scores >= 85',() => assert.ok(scoreImportance('bookingStatus', 95) >= 85));
  it('questionsAnswered scores low', () => assert.ok(scoreImportance('questionsAnswered', 80) < 60));
  it('low confidence reduces score', () => {
    const high = scoreImportance('phone', 90);
    const low  = scoreImportance('phone', 20);
    assert.ok(high > low);
  });
  it('toImportanceLevel: 90 → critical', () => assert.equal(toImportanceLevel(90), 'critical'));
  it('toImportanceLevel: 70 → high',     () => assert.equal(toImportanceLevel(70), 'high'));
  it('toImportanceLevel: 50 → medium',   () => assert.equal(toImportanceLevel(50), 'medium'));
  it('toImportanceLevel: 30 → low',      () => assert.equal(toImportanceLevel(30), 'low'));
  it('toImportanceLevel: 10 → negligible',() => assert.equal(toImportanceLevel(10), 'negligible'));
});

// ─── MemoryRetention ─────────────────────────────────────────────────────────

describe('MemoryRetention', () => {
  it('phone → permanent',     () => assert.equal(assignRetention('phone', 'critical'), 'permanent'));
  it('visitorName → permanent',() => assert.equal(assignRetention('visitorName', 'critical'), 'permanent'));
  it('questionsAnswered → session', () => assert.equal(assignRetention('questionsAnswered', 'low'), 'session'));
  it('preferredTime → 30_days', () => assert.equal(assignRetention('preferredTime', 'medium'), '30_days'));
  it('budget → 90_days',      () => assert.equal(assignRetention('budget', 'high'), '90_days'));
  it('summary → 1_year',      () => assert.equal(assignRetention('summary', 'medium'), '1_year'));
  it('unknown critical → permanent', () => assert.equal(assignRetention('unknownField', 'critical'), 'permanent'));
  it('unknown low → 30_days', () => assert.equal(assignRetention('unknownField', 'low'), '30_days'));
});

// ─── MemoryScorer / buildMemoryItem ──────────────────────────────────────────

describe('MemoryScorer', () => {
  it('builds a frozen MemoryItem', () => {
    const i = item('phone', '555-1234');
    assert.throws(() => { (i as any).key = 'x'; }, TypeError);
  });
  it('sets domain from classifier',    () => assert.equal(item('phone', '555').domain, 'identity'));
  it('sets importance from scorer',    () => assert.ok(['critical','high','medium','low','negligible'].includes(item('phone','555').importance)));
  it('sets retention from policy',     () => assert.equal(item('phone','555').retention, 'permanent'));
  it('needsRevalidation=true when confidence<50', () => assert.equal(item('phone','555',30).needsRevalidation, true));
  it('needsRevalidation=false when confidence>=50', () => assert.equal(item('phone','555',80).needsRevalidation, false));
  it('tags are frozen',                () => { const i = buildMemoryItem({ key:'phone',value:'555',confidence:80,source:'user',tags:['a'] }); assert.throws(() => { (i.tags as any).push('b'); }, TypeError); });
});

// ─── MemoryConflictResolver ───────────────────────────────────────────────────

describe('MemoryConflictResolver', () => {
  it('newest_wins takes incoming for bookingStatus', () => {
    const a = item('bookingStatus','none', 90);
    const b = item('bookingStatus','booked', 90);
    const r = resolveConflict(a, b);
    assert.equal(r.outcome, 'took_incoming');
    assert.equal(r.resolved.value, 'booked');
  });

  it('highest_confidence_wins keeps existing when existing is higher', () => {
    const a = item('phone','555-OLD',90);
    const b = item('phone','555-NEW',60);
    const r = resolveConflict(a, b);
    assert.equal(r.outcome, 'kept_existing');
    assert.equal(r.resolved.value, '555-OLD');
  });

  it('highest_confidence_wins takes incoming when incoming is higher', () => {
    const a = item('phone','555-OLD',50);
    const b = item('phone','555-NEW',85);
    const r = resolveConflict(a, b);
    assert.equal(r.outcome, 'took_incoming');
  });

  it('merge combines array values for painPoints', () => {
    const a = item('painPoints',['slow system'],80);
    const b = item('painPoints',['high cost'],75);
    const r = resolveConflict(a, b);
    assert.equal(r.outcome, 'merged');
    assert.ok(Array.isArray(r.resolved.value));
    assert.ok((r.resolved.value as string[]).includes('slow system'));
    assert.ok((r.resolved.value as string[]).includes('high cost'));
  });

  it('mark_uncertain when confidence gap is small', () => {
    const a = item('summary','old', 65);
    const b = item('summary','new', 60);
    const r = resolveConflict(a, b);
    assert.ok(r.outcome === 'marked_uncertain' || r.outcome === 'kept_existing');
  });

  it('require_revalidation when incoming confidence < 40', () => {
    const a = item('summary','old', 70);
    const b = item('summary','new', 30);
    const r = resolveConflict(a, b);
    assert.equal(r.outcome, 'kept_existing');
    assert.equal(r.resolved.needsRevalidation, true);
  });
});

// ─── MemoryTimeline ───────────────────────────────────────────────────────────

describe('MemoryTimeline', () => {
  it('permanent items never expire', () => {
    const i = item('phone','555');
    assert.equal(i.retention, 'permanent');
    assert.equal(isExpired(i, Date.now() + 999 * 24 * 3600 * 1000), false);
  });

  it('30_day item expires after 31 days', () => {
    const i = buildMemoryItem({ key:'preferredTime', value:'tomorrow', confidence:80, source:'context' });
    const future = Date.now() + 31 * 24 * 3600 * 1000;
    assert.equal(isExpired(i, future), true);
  });

  it('30_day item valid within 30 days', () => {
    const i = buildMemoryItem({ key:'preferredTime', value:'tomorrow', confidence:80, source:'context' });
    const near = Date.now() + 10 * 24 * 3600 * 1000;
    assert.equal(isExpired(i, near), false);
  });

  it('filterActive removes expired items', () => {
    const perm  = item('phone','555');
    const short = buildMemoryItem({ key:'preferredTime', value:'tomorrow', confidence:80, source:'context' });
    const future = Date.now() + 60 * 24 * 3600 * 1000;
    const active = filterActive([perm, short], future);
    assert.ok(active.some(i => i.key === 'phone'));
    assert.ok(!active.some(i => i.key === 'preferredTime'));
  });

  it('expiresAt returns null for permanent', () => {
    assert.equal(expiresAt(item('phone','555')), null);
  });

  it('expiresAt returns a date for 90_days', () => {
    const i = buildMemoryItem({ key:'budget', value:'5000', confidence:80, source:'context' });
    const exp = expiresAt(i);
    assert.ok(exp instanceof Date);
    assert.ok(exp > new Date());
  });
});

// ─── MemoryCompressor ─────────────────────────────────────────────────────────

describe('MemoryCompressor', () => {
  it('deduplicates items with same key — keeps higher confidence', () => {
    const a = item('phone','555-LOW',  50);
    const b = item('phone','555-HIGH', 90);
    const { compressed } = compressMemory([a, b]);
    assert.equal(compressed.filter(i => i.key === 'phone').length, 1);
    assert.equal(compressed.find(i => i.key === 'phone')?.value, '555-HIGH');
  });

  it('removedCount reflects actual removals', () => {
    const a = item('phone','555-LOW',  50);
    const b = item('phone','555-HIGH', 90);
    const { removedCount } = compressMemory([a, b]);
    assert.equal(removedCount, 1);
  });

  it('preserves unique items', () => {
    const items = [item('phone','555',90), item('email','a@b.com',85)];
    const { compressed } = compressMemory(items);
    assert.equal(compressed.length, 2);
  });

  it('handles empty array', () => {
    const { compressed, removedCount } = compressMemory([]);
    assert.equal(compressed.length, 0);
    assert.equal(removedCount, 0);
  });
});

// ─── MemorySummarizer ─────────────────────────────────────────────────────────

describe('MemorySummarizer', () => {
  it('returns default when no items', () => {
    const s = summarizeMemory([]);
    assert.ok(s.length > 0);
  });

  it('includes name and company when present', () => {
    const items = [item('visitorName','Alice'), item('company','Acme')];
    const s = summarizeMemory(items);
    assert.ok(s.includes('Alice'));
    assert.ok(s.includes('Acme'));
  });

  it('includes phone', () => {
    const items = [item('phone','555-1234')];
    assert.ok(summarizeMemory(items).includes('555-1234'));
  });

  it('includes service', () => {
    const items = [item('service','AC Repair')];
    assert.ok(summarizeMemory(items).includes('AC Repair'));
  });

  it('includes booking status when not none', () => {
    const items = [item('bookingStatus','booked')];
    assert.ok(summarizeMemory(items).includes('booked'));
  });
});

// ─── MemoryRetriever ──────────────────────────────────────────────────────────

describe('MemoryRetriever', () => {
  const pool = [
    item('visitorName','Alice',90),
    item('phone','555',90),
    item('email','a@b.com',85),
    item('budget','5000',70),
    item('company','Acme',80),
    item('painPoints',['slow'],65),
  ];

  it('booking context includes phone and name', () => {
    const r = retrieveForContext(pool, { context: 'booking' });
    assert.ok(r.some(i => i.key === 'phone'));
    assert.ok(r.some(i => i.key === 'visitorName'));
  });

  it('sales context includes budget and pain points', () => {
    const r = retrieveForContext(pool, { context: 'sales' });
    assert.ok(r.some(i => i.key === 'budget'));
    assert.ok(r.some(i => i.key === 'painPoints'));
  });

  it('maxItems limits results', () => {
    const r = retrieveForContext(pool, { context: 'general', maxItems: 2 });
    assert.ok(r.length <= 2);
  });

  it('minImportance filters results', () => {
    const r = retrieveForContext(pool, { context: 'booking', minImportance: 'critical' });
    assert.ok(r.every(i => i.importance === 'critical'));
  });

  it('findLowConfidence returns items below threshold', () => {
    const items = [item('phone','555',80), item('summary','...',30)];
    const low = findLowConfidence(items, 50);
    assert.ok(low.some(i => i.key === 'summary'));
    assert.ok(!low.some(i => i.key === 'phone'));
  });

  it('findLowConfidence includes needsRevalidation items', () => {
    const flagged = buildMemoryItem({ key:'company', value:'X', confidence:60, source:'context' });
    const withFlag = { ...flagged, needsRevalidation: true } as MemoryItem;
    const low = findLowConfidence([withFlag], 50);
    assert.ok(low.some(i => i.key === 'company'));
  });
});

// ─── MemoryProfile ────────────────────────────────────────────────────────────

describe('MemoryProfile', () => {
  it('builds a frozen profile', () => {
    const p = buildMemoryProfile({ conversationId:'c1', organizationId:'o1', items:[], conflicts:[] });
    assert.throws(() => { (p as any).conversationId = 'x'; }, TypeError);
  });

  it('profile has summary', () => {
    const p = buildMemoryProfile({ conversationId:'c1', organizationId:'o1', items:[item('phone','555')], conflicts:[] });
    assert.ok(p.summary.length > 0);
  });

  it('lowConfidenceKeys populated', () => {
    const low = buildMemoryItem({ key:'company', value:'X', confidence:30, source:'regex' });
    const p = buildMemoryProfile({ conversationId:'c1', organizationId:'o1', items:[low], conflicts:[] });
    assert.ok(p.lowConfidenceKeys.includes('company'));
  });

  it('profile generatedAt is an ISO string', () => {
    const p = buildMemoryProfile({ conversationId:'c1', organizationId:'o1', items:[], conflicts:[] });
    assert.ok(new Date(p.generatedAt).getTime() > 0);
  });
});

// ─── MemoryEngine.process ─────────────────────────────────────────────────────

describe('MemoryEngine.process — full pipeline', () => {
  it('returns a MemoryProfile from empty rich memory', () => {
    const p = MemoryEngine.process({ memory: emptyRichMemory(), conversationId:'c1', organizationId:'o1' });
    assert.ok(p.conversationId === 'c1');
    assert.ok(Array.isArray(p.items));
  });

  it('extracts phone from rich memory', () => {
    const mem = emptyRichMemory();
    mem.rich.phone = { value: '555-1234', confidence: 90, source: 'context' };
    const p = MemoryEngine.process({ memory: mem, conversationId:'c1', organizationId:'o1' });
    assert.ok(p.items.some(i => i.key === 'phone' && i.value === '555-1234'));
  });

  it('extracts visitorName', () => {
    const mem = emptyRichMemory();
    mem.rich.visitorName = { value: 'Alice', confidence: 90, source: 'context' };
    const p = MemoryEngine.process({ memory: mem, conversationId:'c1', organizationId:'o1' });
    assert.ok(p.items.some(i => i.key === 'visitorName'));
  });

  it('extracts pain points array', () => {
    const mem = { ...emptyRichMemory(), painPoints: ['slow', 'expensive'] };
    const p = MemoryEngine.process({ memory: mem as any, conversationId:'c1', organizationId:'o1' });
    assert.ok(p.items.some(i => i.key === 'painPoints'));
  });

  it('conflicts are recorded when values differ', () => {
    const existing = [item('phone','555-OLD', 80)];
    const mem = emptyRichMemory();
    mem.rich.phone = { value: '555-NEW', confidence: 90, source: 'context' };
    const p = MemoryEngine.process({ memory: mem, conversationId:'c1', organizationId:'o1', existingItems: existing });
    assert.ok(p.conflicts.length > 0);
  });

  it('profile is immutable', () => {
    const p = MemoryEngine.process({ memory: emptyRichMemory(), conversationId:'c1', organizationId:'o1' });
    assert.throws(() => { (p as any).summary = 'x'; }, TypeError);
  });

  it('MemoryEngine.retrieve works on profile items', () => {
    const mem = emptyRichMemory();
    mem.rich.phone = { value: '555', confidence: 90, source: 'context' };
    const p = MemoryEngine.process({ memory: mem, conversationId:'c1', organizationId:'o1' });
    const r = MemoryEngine.retrieve(p.items, { context: 'booking' });
    assert.ok(r.some(i => i.key === 'phone'));
  });

  it('getLowConfidence returns items needing revalidation', () => {
    const mem = emptyRichMemory();
    mem.rich.company = { value: 'Acme', confidence: 25, source: 'regex' };
    const p = MemoryEngine.process({ memory: mem, conversationId:'c1', organizationId:'o1' });
    const low = MemoryEngine.getLowConfidence(p.items);
    assert.ok(low.some(i => i.key === 'company'));
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('compressMemory handles single item', () => {
    const { compressed } = compressMemory([item('phone','555',90)]);
    assert.equal(compressed.length, 1);
  });

  it('retrieveForContext returns empty for unrecognised fields', () => {
    const items = [item('unknownXYZ','val',80)];
    const r = retrieveForContext(items, { context: 'booking' });
    assert.equal(r.length, 0);
  });

  it('resolveConflict handles identical values gracefully', () => {
    const a = item('phone','555',80);
    const b = item('phone','555',80);
    const r = resolveConflict(a, b);
    assert.ok(r.resolved.value === '555');
  });

  it('filterActive with empty array', () => {
    assert.equal(filterActive([]).length, 0);
  });

  it('buildMemoryItem with empty tags', () => {
    const i = buildMemoryItem({ key:'phone', value:'555', confidence:80, source:'user' });
    assert.deepEqual([...i.tags], []);
  });

  it('MemoryEngine.process with no existing items', () => {
    assert.doesNotThrow(() =>
      MemoryEngine.process({ memory: emptyRichMemory(), conversationId:'c1', organizationId:'o1' })
    );
  });

  it('summarizeMemory with null values in items skips them', () => {
    const items = [buildMemoryItem({ key:'phone', value:null as any, confidence:80, source:'user' })];
    const s = summarizeMemory(items.filter(i => i.value !== null));
    assert.ok(typeof s === 'string');
  });
});
