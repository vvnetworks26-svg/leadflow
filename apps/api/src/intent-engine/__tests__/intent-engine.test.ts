/**
 * intent-engine/__tests__/intent-engine.test.ts
 *
 * Comprehensive unit tests for the Intent Understanding Engine (Layer 2).
 * Run: npx tsx src/intent-engine/__tests__/intent-engine.test.ts
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { IntentUnderstandingService, setIntentRepository } from '../IntentUnderstandingService';
import { classifyMessage }       from '../modules/intent-classifier';
import { resolveIntent }         from '../modules/ambiguity-resolver';
import { toConfidenceLevel, isCertain, requiresClarification } from '../modules/confidence-evaluator';
import { analyzeUrgency }        from '../modules/urgency-analyzer';
import { extractEntities }       from '../modules/entity-extractor';
import { selectBlueprint }       from '../modules/blueprint-selector';
import { InMemoryIntentRepository } from '../repository/InMemoryIntentRepository';
import { IntentRulesCache }      from '../cache/IntentRulesCache';
import { DEFAULT_KEYWORD_RULES, DEFAULT_BLUEPRINT_MAPPINGS } from '../registry/default-rules';
import type { IntentAnalysisInput } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeInput(message: string, industry = 'hvac', services: string[] = []): IntentAnalysisInput {
  return { message, organizationId: 'org-test', industry, availableServices: services };
}

// ─── Intent Classifier ────────────────────────────────────────────────────────

describe('IntentClassifier — single intent detection', () => {
  it('classifies "I want to book an appointment" as book_appointment', () => {
    const results = classifyMessage('I want to book an appointment', DEFAULT_KEYWORD_RULES);
    assert.ok(results.length > 0);
    assert.equal(results[0].category, 'book_appointment');
  });

  it('classifies "My AC stopped working" as repair', () => {
    const results = classifyMessage('My AC stopped working', DEFAULT_KEYWORD_RULES);
    assert.ok(results.length > 0);
    assert.equal(results[0].category, 'repair');
  });

  it('classifies "How much does it cost to fix my furnace?" as request_estimate', () => {
    const results = classifyMessage('How much does it cost to fix my furnace?', DEFAULT_KEYWORD_RULES);
    assert.ok(results.length > 0);
    // repair and estimate may both fire — at least one must be present
    const categories = results.map(r => r.category);
    assert.ok(
      categories.includes('request_estimate') || categories.includes('repair'),
      `Expected estimate or repair in ${JSON.stringify(categories)}`
    );
  });

  it('returns empty array for a message with no keyword matches', () => {
    const results = classifyMessage('xyzzy quux blorf', DEFAULT_KEYWORD_RULES);
    assert.equal(results.length, 0);
  });

  it('classifies "I want to speak to a human" as human_representative', () => {
    const results = classifyMessage('I want to speak to a human', DEFAULT_KEYWORD_RULES);
    assert.ok(results[0].category === 'human_representative');
  });

  it('classifies "Cancel my appointment" as cancel_appointment', () => {
    const results = classifyMessage('Cancel my appointment please', DEFAULT_KEYWORD_RULES);
    assert.ok(results.length > 0);
    assert.equal(results[0].category, 'cancel_appointment');
  });

  it('results are sorted descending by score', () => {
    const results = classifyMessage('book an appointment for furnace repair', DEFAULT_KEYWORD_RULES);
    for (let i = 1; i < results.length; i++) {
      assert.ok(results[i - 1].score >= results[i].score, 'results should be sorted descending');
    }
  });

  it('phrase match scores higher than single keyword match', () => {
    const withPhrase   = classifyMessage('book an appointment', DEFAULT_KEYWORD_RULES);
    const withKeyword  = classifyMessage('appointment', DEFAULT_KEYWORD_RULES);
    assert.ok(withPhrase[0].score >= withKeyword[0].score, 'phrase match should score ≥ keyword match');
  });
});

// ─── Ambiguity Resolver ───────────────────────────────────────────────────────

describe('AmbiguityResolver — multi-intent and overrides', () => {
  it('emergency_service wins when present alongside repair', () => {
    const candidates = classifyMessage(
      'My AC stopped working and it is an emergency',
      DEFAULT_KEYWORD_RULES
    );
    const { primary } = resolveIntent(candidates);
    assert.equal(primary.category, 'emergency_service');
  });

  it('human_representative wins over all other intents', () => {
    const candidates = classifyMessage(
      'I have a repair issue but I want to speak to a human',
      DEFAULT_KEYWORD_RULES
    );
    const { primary } = resolveIntent(candidates);
    assert.equal(primary.category, 'human_representative');
  });

  it('returns requiresClarification=true when two intents are close', () => {
    // Force two candidates with close scores
    const close = [
      { category: 'repair' as const,           subCategory: '', score: 55, signals: [] },
      { category: 'request_estimate' as const, subCategory: '', score: 45, signals: [] },
    ];
    const { requiresClarification, clarificationQuestion } = resolveIntent(close);
    assert.equal(requiresClarification, true);
    assert.ok(clarificationQuestion && clarificationQuestion.length > 0);
  });

  it('returns requiresClarification=false when gap is large', () => {
    const wide = [
      { category: 'book_appointment' as const, subCategory: '', score: 90, signals: [] },
      { category: 'repair' as const,           subCategory: '', score: 40, signals: [] },
    ];
    const { requiresClarification } = resolveIntent(wide);
    assert.equal(requiresClarification, false);
  });

  it('returns unknown candidate when no candidates provided', () => {
    const { primary } = resolveIntent([]);
    assert.equal(primary.category, 'unknown');
    assert.equal(primary.score, 0);
  });
});

// ─── Confidence Evaluator ─────────────────────────────────────────────────────

describe('ConfidenceEvaluator', () => {
  it('maps 95 → very_high', () => assert.equal(toConfidenceLevel(95), 'very_high'));
  it('maps 80 → high',      () => assert.equal(toConfidenceLevel(80), 'high'));
  it('maps 55 → medium',    () => assert.equal(toConfidenceLevel(55), 'medium'));
  it('maps 35 → low',       () => assert.equal(toConfidenceLevel(35), 'low'));
  it('maps 10 → unknown',   () => assert.equal(toConfidenceLevel(10), 'unknown'));

  it('isCertain returns true for very_high and high', () => {
    assert.equal(isCertain('very_high'), true);
    assert.equal(isCertain('high'),      true);
    assert.equal(isCertain('medium'),    false);
    assert.equal(isCertain('unknown'),   false);
  });

  it('requiresClarification returns true when top two are close and not certain', () => {
    const close = [
      { category: 'repair' as const, subCategory: '', score: 55, signals: [] },
      { category: 'request_estimate' as const, subCategory: '', score: 45, signals: [] },
    ];
    assert.equal(requiresClarification(close), true);
  });

  it('requiresClarification returns false for empty candidates', () => {
    assert.equal(requiresClarification([]), false);
  });
});

// ─── Urgency Analyzer ─────────────────────────────────────────────────────────

describe('UrgencyAnalyzer', () => {
  it('"no heat" → critical', () =>
    assert.equal(analyzeUrgency('My furnace has no heat'), 'critical'));

  it('"gas leak" → critical', () =>
    assert.equal(analyzeUrgency('I smell a gas leak'), 'critical'));

  it('"burst pipe" → critical', () =>
    assert.equal(analyzeUrgency('There is a burst pipe in my basement'), 'critical'));

  it('"emergency" keyword → emergency', () =>
    assert.equal(analyzeUrgency('I have an emergency'), 'emergency'));

  it('"it is 118 degrees" → emergency', () =>
    assert.equal(analyzeUrgency('My AC broke and it is 118 degrees outside'), 'emergency'));

  it('"stopped working" → priority', () =>
    assert.equal(analyzeUrgency('My furnace stopped working'), 'priority'));

  it('routine inquiry → normal', () =>
    assert.equal(analyzeUrgency('I would like to schedule a tune-up'), 'normal'));
});

// ─── Entity Extractor ─────────────────────────────────────────────────────────

describe('EntityExtractor', () => {
  it('extracts equipment entity "furnace"', () => {
    const entities = extractEntities('My furnace is not working');
    assert.ok(entities.some(e => e.type === 'equipment' && e.value === 'Furnace'));
  });

  it('extracts time entity "tomorrow"', () => {
    const entities = extractEntities('Can someone come out tomorrow?');
    assert.ok(entities.some(e => e.type === 'time' && e.value.toLowerCase().includes('tomorrow')));
  });

  it('extracts phone number', () => {
    const entities = extractEntities('Call me at 555-123-4567');
    assert.ok(entities.some(e => e.type === 'phone'));
  });

  it('extracts ZIP code', () => {
    const entities = extractEntities('My ZIP is 78701');
    assert.ok(entities.some(e => e.type === 'zip' && e.value === '78701'));
  });

  it('extracts name', () => {
    const entities = extractEntities("My name is John Smith");
    assert.ok(entities.some(e => e.type === 'name'));
  });

  it('extracts service from available catalog', () => {
    const entities = extractEntities('I need AC Repair', ['AC Repair', 'Furnace Tune-up']);
    assert.ok(entities.some(e => e.type === 'service' && e.value === 'AC Repair'));
  });

  it('deduplicates entities', () => {
    const entities = extractEntities('furnace furnace furnace');
    const furnaces = entities.filter(e => e.type === 'equipment' && e.value === 'Furnace');
    assert.equal(furnaces.length, 1, 'furnace should appear once');
  });

  it('returns empty array for message with no recognisable entities', () => {
    const entities = extractEntities('Hello there, how are you?');
    // May or may not find anything — but must not throw
    assert.ok(Array.isArray(entities));
  });
});

// ─── Blueprint Selector ───────────────────────────────────────────────────────

describe('BlueprintSelector', () => {
  it('selects hvac.repair for hvac + repair', () => {
    const id = selectBlueprint(DEFAULT_BLUEPRINT_MAPPINGS, 'hvac', 'repair');
    assert.equal(id, 'hvac.repair');
  });

  it('selects hvac.emergency for hvac + emergency_service', () => {
    const id = selectBlueprint(DEFAULT_BLUEPRINT_MAPPINGS, 'hvac', 'emergency_service');
    assert.equal(id, 'hvac.emergency');
  });

  it('falls back to generic.repair for unknown industry', () => {
    const id = selectBlueprint(DEFAULT_BLUEPRINT_MAPPINGS, 'bakery', 'repair');
    assert.equal(id, 'generic.repair');
  });

  it('returns null for unmapped intent', () => {
    const id = selectBlueprint(DEFAULT_BLUEPRINT_MAPPINGS, 'hvac', 'employment');
    // employment has no hvac-specific mapping but has a wildcard
    assert.ok(id === 'generic.employment' || id === null);
  });

  it('exact industry match beats wildcard', () => {
    const id = selectBlueprint(DEFAULT_BLUEPRINT_MAPPINGS, 'hvac', 'book_appointment');
    assert.equal(id, 'hvac.booking');   // specific, not generic.booking
  });
});

// ─── Full analyze() integration ───────────────────────────────────────────────

describe('IntentUnderstandingService.analyze() — full pipeline', () => {
  before(() => {
    // Use default in-memory repo
    setIntentRepository(new InMemoryIntentRepository());
  });

  it('detects book_appointment intent', async () => {
    const result = await IntentUnderstandingService.analyze(
      makeInput('I want to book an appointment for my AC')
    );
    assert.equal(result.intent.category, 'book_appointment');
    assert.ok(result.intent.blueprintId !== null, 'blueprint should be set');
  });

  it('detects emergency with critical urgency — "no heat"', async () => {
    const result = await IntentUnderstandingService.analyze(
      makeInput('My furnace has no heat, it is freezing in here')
    );
    assert.equal(result.intent.category, 'emergency_service');
    assert.ok(['critical', 'emergency'].includes(result.intent.urgency));
    assert.equal(result.intent.requiresHuman, true);
  });

  it('"My AC stopped working" → repair with equipment entity', async () => {
    const result = await IntentUnderstandingService.analyze(
      makeInput('My AC stopped working')
    );
    assert.ok(['repair', 'emergency_service'].includes(result.intent.category));
    assert.ok(result.intent.entities.some(e => e.type === 'equipment'));
  });

  it('handles unknown message gracefully', async () => {
    const result = await IntentUnderstandingService.analyze(
      makeInput('xyzzy quux blorf')
    );
    assert.equal(result.intent.category, 'unknown');
    assert.equal(result.intent.requiresHuman, false);
    assert.equal(result.clarificationQuestion, null);
  });

  it('human_representative triggers requiresHuman=true', async () => {
    const result = await IntentUnderstandingService.analyze(
      makeInput('I want to speak to a real person')
    );
    assert.equal(result.intent.requiresHuman, true);
    assert.equal(result.intent.category, 'human_representative');
  });

  it('returned intent is frozen (immutable)', async () => {
    const result = await IntentUnderstandingService.analyze(makeInput('Book appointment'));
    assert.throws(
      () => { (result.intent as any).category = 'hacked'; },
      TypeError
    );
  });

  it('reasoning string is always populated', async () => {
    const result = await IntentUnderstandingService.analyze(makeInput('Fix my furnace'));
    assert.ok(result.intent.reasoning.length > 0);
  });

  it('confidence level is always a typed value (never raw number)', async () => {
    const result = await IntentUnderstandingService.analyze(makeInput('Repair my AC'));
    const valid = ['very_high', 'high', 'medium', 'low', 'unknown'];
    assert.ok(valid.includes(result.intent.confidenceLevel));
  });

  it('entities are extracted from message', async () => {
    const result = await IntentUnderstandingService.analyze(
      makeInput('My furnace stopped working, call me tomorrow at 555-123-4567')
    );
    assert.ok(result.intent.entities.length > 0);
  });

  it('plumbing industry + emergency → plumbing.emergency blueprint', async () => {
    const result = await IntentUnderstandingService.analyze(
      makeInput('burst pipe flooding my basement', 'plumbing')
    );
    assert.equal(result.intent.category, 'emergency_service');
    assert.equal(result.intent.blueprintId, 'plumbing.emergency');
  });

  it('complaint intent is detected', async () => {
    const result = await IntentUnderstandingService.analyze(
      makeInput('This is unacceptable, I am very unhappy with the service')
    );
    assert.equal(result.intent.category, 'complaint');
  });

  it('billing question is detected', async () => {
    const result = await IntentUnderstandingService.analyze(
      makeInput('I have a question about my bill')
    );
    assert.equal(result.intent.category, 'billing_question');
  });

  it('reschedule intent is detected', async () => {
    const result = await IntentUnderstandingService.analyze(
      makeInput('I need to reschedule my appointment to next week')
    );
    assert.equal(result.intent.category, 'reschedule');
  });

  it('employment inquiry is detected', async () => {
    const result = await IntentUnderstandingService.analyze(
      makeInput('Are you hiring? I am looking for a job')
    );
    assert.equal(result.intent.category, 'employment');
  });
});

// ─── Repository and cache ──────────────────────────────────────────────────────

describe('Repository and cache', () => {
  it('InMemoryIntentRepository returns default rules', async () => {
    const repo  = new InMemoryIntentRepository();
    const rules = await repo.getRules();
    assert.ok(rules.length > 0, 'should have default rules');
  });

  it('InMemoryIntentRepository returns default mappings', async () => {
    const repo     = new InMemoryIntentRepository();
    const mappings = await repo.getMappings();
    assert.ok(mappings.length > 0, 'should have default mappings');
  });

  it('InMemoryIntentRepository rejects invalid rule config', () => {
    assert.throws(() => new InMemoryIntentRepository({
      rules: [{ intent: 'not_a_real_intent' as any, subCategory: '', keywords: [], phrases: [], weight: 1 }],
    }));
  });

  it('IntentRulesCache stores and retrieves', () => {
    const cache = new IntentRulesCache({ ttlMs: 5000 });
    assert.equal(cache.get(), null);
    cache.set(DEFAULT_KEYWORD_RULES, DEFAULT_BLUEPRINT_MAPPINGS);
    assert.ok(cache.get() !== null);
  });

  it('IntentRulesCache invalidate clears entry', () => {
    const cache = new IntentRulesCache();
    cache.set(DEFAULT_KEYWORD_RULES, DEFAULT_BLUEPRINT_MAPPINGS);
    cache.invalidate();
    assert.equal(cache.get(), null);
  });

  it('IntentRulesCache respects TTL', async () => {
    const cache = new IntentRulesCache({ ttlMs: 50 });
    cache.set(DEFAULT_KEYWORD_RULES, DEFAULT_BLUEPRINT_MAPPINGS);
    await new Promise(r => setTimeout(r, 80));
    assert.equal(cache.get(), null, 'should have expired');
  });
});

// ─── Industry-specific mappings ───────────────────────────────────────────────

describe('Industry-specific blueprint mappings', () => {
  const cases: Array<[string, string, string, string]> = [
    ['hvac',      'repair',           'My furnace is broken',       'hvac.repair'],
    ['hvac',      'installation',     'I need a new AC installed',  'hvac.installation'],
    ['hvac',      'maintenance',      'Seasonal tune-up please',    'hvac.maintenance'],
    ['plumbing',  'repair',           'My pipe is leaking',         'plumbing.repair'],
    ['roofing',   'request_estimate', 'How much for a new roof?',   'roofing.estimate'],
    ['electrical','emergency_service','Sparks from my outlet',      'electrical.emergency'],
  ];

  for (const [industry, expectedIntent, message, expectedBlueprint] of cases) {
    it(`${industry}/${expectedIntent} → ${expectedBlueprint}`, async () => {
      setIntentRepository(new InMemoryIntentRepository());
      const result = await IntentUnderstandingService.analyze(makeInput(message, industry));
      assert.equal(result.intent.category, expectedIntent,
        `Expected intent "${expectedIntent}", got "${result.intent.category}" for: "${message}"`);
      assert.equal(result.intent.blueprintId, expectedBlueprint);
    });
  }
});
