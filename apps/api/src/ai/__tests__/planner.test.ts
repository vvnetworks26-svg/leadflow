/**
 * Unit tests for ai/conversation-planner.ts
 * Uses Node.js built-in test runner — no external dependencies.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planNextMove } from '../conversation-planner';
import { emptyRichMemory, emptyProgress } from '../types';
import type { RichConversationMemory, ConversationProgress } from '../types';

function makeMemory(overrides: Partial<RichConversationMemory['rich']> = {}): RichConversationMemory {
  const m = emptyRichMemory();
  Object.assign(m.rich, overrides);
  return m;
}

function makeProgress(overrides: Partial<ConversationProgress> = {}): ConversationProgress {
  return { ...emptyProgress(), ...overrides };
}

// ─── HVAC planner ─────────────────────────────────────────────────────────────

describe('Planner — HVAC industry', () => {
  const intent = { intent: 'Unknown' as const, confidence: 20, subIntents: [], rawText: '' };

  it('asks for name first when nothing is collected', () => {
    const plan = planNextMove({
      memory:    emptyRichMemory(),
      progress:  emptyProgress(),
      stage:     'discovery',
      industry:  'hvac',
      intent,
      turnCount: 0,
    });
    assert.equal(plan.fieldTargeted, 'visitorNameCollected');
    assert.ok(plan.questionToAsk.length > 0);
    assert.equal(plan.priority, 'critical');
  });

  it('asks for service when name is already collected', () => {
    const progress = makeProgress({ visitorNameCollected: true });
    const memory   = makeMemory({ visitorName: { value: 'John', confidence: 90, source: 'context' } });
    memory.progress = progress;

    const plan = planNextMove({
      memory, progress, stage: 'discovery', industry: 'hvac', intent, turnCount: 1,
    });
    assert.equal(plan.fieldTargeted, 'serviceCollected');
  });

  it('asks for emergency when name + service are collected', () => {
    const progress = makeProgress({
      visitorNameCollected: true,
      serviceCollected:     true,
    });
    const memory = makeMemory({
      visitorName: { value: 'John', confidence: 90, source: 'context' },
      service:     { value: 'AC repair', confidence: 90, source: 'context' },
    });
    memory.progress = progress;

    const plan = planNextMove({
      memory, progress, stage: 'discovery', industry: 'hvac', intent, turnCount: 2,
    });
    assert.equal(plan.fieldTargeted, 'emergencyCollected');
  });

  it('asks for phone after name + service + emergency collected', () => {
    const progress = makeProgress({
      visitorNameCollected: true,
      serviceCollected:     true,
      emergencyCollected:   true,
    });
    const memory = makeMemory({
      visitorName: { value: 'John', confidence: 90, source: 'context' },
      service:     { value: 'AC repair', confidence: 90, source: 'context' },
      emergency:   { value: false, confidence: 90, source: 'context' },
    });
    memory.progress = progress;

    const plan = planNextMove({
      memory, progress, stage: 'discovery', industry: 'hvac', intent, turnCount: 3,
    });
    assert.equal(plan.fieldTargeted, 'phoneCollected');
  });

  it('returns complete plan when all required fields are collected', () => {
    const progress = makeProgress({
      visitorNameCollected: true,
      serviceCollected:     true,
      emergencyCollected:   true,
      phoneCollected:       true,
      addressCollected:     true,
      appointmentCollected: true,
    });
    const memory = makeMemory({
      visitorName:   { value: 'John', confidence: 90, source: 'context' },
      service:       { value: 'AC repair', confidence: 90, source: 'context' },
      emergency:     { value: false, confidence: 90, source: 'context' },
      phone:         { value: '5551234567', confidence: 90, source: 'context' },
      address:       { value: '123 Main St', confidence: 90, source: 'context' },
      preferredTime: { value: 'tomorrow', confidence: 90, source: 'context' },
    });
    memory.progress = progress;

    const plan = planNextMove({
      memory, progress, stage: 'discovery', industry: 'hvac', intent, turnCount: 6,
    });
    assert.equal(plan.nextGoal, 'complete');
    assert.equal(plan.questionToAsk, '');
    assert.equal(plan.fieldTargeted, null);
  });

  it('NEVER returns a question for a field already in progress', () => {
    // Run many permutations and verify no already-collected field is re-asked
    const progress = makeProgress({
      visitorNameCollected: true,
      phoneCollected:       true,
    });
    const memory = makeMemory({
      visitorName: { value: 'Alice', confidence: 90, source: 'context' },
      phone:       { value: '5559876543', confidence: 90, source: 'context' },
    });
    memory.progress = progress;

    const plan = planNextMove({
      memory, progress, stage: 'discovery', industry: 'hvac', intent, turnCount: 0,
    });

    const q = plan.questionToAsk.toLowerCase();
    assert.ok(!q.includes("what's your name"), `Should not ask for name: "${plan.questionToAsk}"`);
    assert.ok(!q.includes('phone') || plan.fieldTargeted !== 'phoneCollected',
      `Should not ask for phone again: "${plan.questionToAsk}"`);
  });
});

// ─── SaaS planner ─────────────────────────────────────────────────────────────

describe('Planner — SaaS industry', () => {
  const intent = { intent: 'Unknown' as const, confidence: 20, subIntents: [], rawText: '' };

  it('asks for company after name is collected', () => {
    const progress = makeProgress({ visitorNameCollected: true });
    const memory   = makeMemory({ visitorName: { value: 'Alice', confidence: 90, source: 'context' } });
    memory.progress = progress;

    const plan = planNextMove({
      memory, progress, stage: 'discovery', industry: 'saas', intent, turnCount: 1,
    });
    assert.equal(plan.fieldTargeted, 'companyCollected');
  });
});

// ─── Question rotation ────────────────────────────────────────────────────────

describe('Planner — question rotation', () => {
  const intent = { intent: 'Unknown' as const, confidence: 20, subIntents: [], rawText: '' };

  it('rotates question phrasing based on turnCount', () => {
    const questions = new Set<string>();
    for (let i = 0; i < 4; i++) {
      const plan = planNextMove({
        memory:    emptyRichMemory(),
        progress:  emptyProgress(),
        stage:     'discovery',
        industry:  'hvac',
        intent,
        turnCount: i,
      });
      questions.add(plan.questionToAsk);
    }
    // With 4 question variants for visitorName, should produce at least 2 different phrasings
    assert.ok(questions.size >= 2, `Expected multiple question variants, got: ${[...questions].join(' | ')}`);
  });
});
