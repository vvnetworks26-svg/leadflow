/**
 * engine.test.ts — Conversation Engine v2.1 regression tests
 *
 * Covers:
 *   - Complete HVAC conversation flow
 *   - Interrupted conversation resume
 *   - Booking flow
 *   - FAQ / question interruption
 *   - Objection handling
 *   - Repeated answers (no duplicate questions)
 *   - Invalid / unexpected user input
 *   - Gemini unavailable (deterministic fallback)
 *   - No cross-field contamination
 *   - No infinite loops (planner terminates)
 *   - State machine transition rules
 *
 * Uses Node.js built-in test runner — no external dependencies.
 * Run: npx tsx src/ai/__tests__/engine.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { updateMemoryFromMessage, syncProgressFromMemory } from '../memory';
import { planNextMove }                                    from '../conversation-planner';
import { computeNextStage, isValidTransition }             from '../conversation-state';
import { detectIndustry }                                  from '../industry-profiles';
import { classifyIntent }                                  from '../intent';
import { qualifyLead }                                     from '../qualification';
import { emptyMemory, emptyRichMemory, emptyProgress }     from '../types';
import type { RichConversationMemory, ConversationProgress } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeIntent(text: string) {
  return classifyIntent(text);
}

function hvacPlan(memory: RichConversationMemory, progress: ConversationProgress, turn = 0) {
  return planNextMove({
    memory, progress,
    stage: 'discovery',
    industry: 'hvac',
    intent: makeIntent(''),
    turnCount: turn,
  });
}

/** Simulate a multi-turn HVAC conversation, returning final memory */
function simulateHvacConversation(turns: Array<{ ai: string; user: string }>): RichConversationMemory {
  let mem: RichConversationMemory = emptyRichMemory();
  for (const { ai, user } of turns) {
    mem = updateMemoryFromMessage(mem, user, ai) as RichConversationMemory;
  }
  return mem;
}

// ─── Complete HVAC conversation flow ─────────────────────────────────────────

describe('Complete HVAC conversation — field collection order', () => {
  it('collects all required fields in canonical HVAC order', () => {
    let mem = emptyRichMemory();
    const questions: string[] = [];
    const answers = ['John', 'AC repair', 'No, not urgent', '555-111-2222', '90210', 'Tomorrow morning'];
    const aiPrompts = [
      "What's your name?",
      "What service do you need today?",
      "Is this an emergency situation?",
      "What's the best number for our technician to reach you?",
      "What's the service address or ZIP code?",
      "What day works best for you?",
    ];

    for (let i = 0; i < answers.length; i++) {
      const plan = hvacPlan(mem, mem.progress, i);
      questions.push(plan.questionToAsk);
      mem = updateMemoryFromMessage(mem, answers[i], aiPrompts[i]) as RichConversationMemory;
    }

    // After all turns, all required fields should be collected
    assert.equal(mem.progress.visitorNameCollected,  true,  'name collected');
    assert.equal(mem.progress.serviceCollected,      true,  'service collected');
    assert.equal(mem.progress.emergencyCollected,    true,  'emergency collected');
    assert.equal(mem.progress.phoneCollected,        true,  'phone collected');
    assert.equal(mem.progress.addressCollected,      true,  'address collected');
    assert.equal(mem.progress.appointmentCollected,  true,  'appointment collected');
  });

  it('planner returns complete when all fields collected', () => {
    const mem = simulateHvacConversation([
      { ai: "What's your name?",                                user: 'Alice' },
      { ai: "What service do you need?",                        user: 'Furnace repair' },
      { ai: "Is this an emergency?",                            user: 'No' },
      { ai: "What's the best number to reach you?",             user: '555-000-1111' },
      { ai: "What's the service address or ZIP?",               user: '10001' },
      { ai: "What day works best for you?",                     user: 'Monday afternoon' },
    ]) as RichConversationMemory;

    const plan = hvacPlan(mem, mem.progress, 6);
    assert.equal(plan.nextGoal, 'complete', 'planner should signal completion');
    assert.equal(plan.questionToAsk, '', 'no question to ask when complete');
    assert.equal(plan.fieldTargeted, null);
  });
});

// ─── No duplicate questions ────────────────────────────────────────────────────

describe('No duplicate questions', () => {
  it('never asks for name again after name is collected', () => {
    const mem = updateMemoryFromMessage(
      emptyRichMemory(),
      'Sarah',
      "What's your name?"
    ) as RichConversationMemory;

    assert.equal(mem.progress.visitorNameCollected, true);

    // Run planner 10 more times — name should never be asked
    for (let i = 0; i < 10; i++) {
      const plan = hvacPlan(mem, mem.progress, i);
      assert.ok(
        plan.fieldTargeted !== 'visitorNameCollected',
        `Turn ${i}: planner asked for name again — "${plan.questionToAsk}"`
      );
    }
  });

  it('never asks for phone again after phone is collected', () => {
    let mem = updateMemoryFromMessage(emptyRichMemory(), 'Bob', "What's your name?") as RichConversationMemory;
    mem = updateMemoryFromMessage(mem, 'AC unit broken', "What service do you need?") as RichConversationMemory;
    mem = updateMemoryFromMessage(mem, 'No', "Is this an emergency?") as RichConversationMemory;
    mem = updateMemoryFromMessage(mem, '555-999-8888', "What's the best number to reach you?") as RichConversationMemory;

    assert.equal(mem.progress.phoneCollected, true);

    for (let i = 0; i < 5; i++) {
      const plan = hvacPlan(mem, mem.progress, i);
      assert.ok(
        plan.fieldTargeted !== 'phoneCollected',
        `Planner asked for phone again at turn ${i}: "${plan.questionToAsk}"`
      );
    }
  });

  it('never asks for the same field twice across high-confidence and low-confidence', () => {
    // Name captured contextually (confidence=90)
    const mem = updateMemoryFromMessage(
      emptyRichMemory(),
      'Maria',
      "What's your name?"
    ) as RichConversationMemory;

    assert.ok(mem.rich.visitorName.confidence >= 85);

    // Next turn: a message that would regex-match a name — planner must skip name
    const mem2 = updateMemoryFromMessage(mem, "I'm calling about my AC", "What can I help you with?") as RichConversationMemory;
    const plan = hvacPlan(mem2, mem2.progress, 1);

    assert.ok(
      plan.fieldTargeted !== 'visitorNameCollected',
      `Should not ask for name again, got: "${plan.questionToAsk}"`
    );
  });
});

// ─── Interrupted conversation resume ──────────────────────────────────────────

describe('Interrupted conversation resume', () => {
  it('resumes from correct field after partial collection', () => {
    // Simulate a session interrupted after name + service collected
    let mem = updateMemoryFromMessage(emptyRichMemory(), 'Jake', "What's your name?") as RichConversationMemory;
    mem = updateMemoryFromMessage(mem, 'Heat pump installation', "What service do you need?") as RichConversationMemory;

    assert.equal(mem.progress.visitorNameCollected, true);
    assert.equal(mem.progress.serviceCollected, true);
    assert.equal(mem.progress.emergencyCollected, false);

    // On resume, planner should ask about emergency (next required field with condition met)
    const plan = hvacPlan(mem, mem.progress, 2);
    assert.equal(
      plan.fieldTargeted, 'emergencyCollected',
      `Expected emergency question, got: "${plan.questionToAsk}" targeting "${plan.fieldTargeted}"`
    );
  });

  it('does not re-ask any already-collected field on resume', () => {
    const mem = simulateHvacConversation([
      { ai: "What's your name?",              user: 'Tom' },
      { ai: "What service do you need?",      user: 'AC repair' },
      { ai: "Is this an emergency?",          user: 'Yes, no AC in summer' },
    ]) as RichConversationMemory;

    const plan = hvacPlan(mem, mem.progress, 3);

    // Should ask for phone — not name, service, or emergency
    assert.ok(plan.fieldTargeted !== 'visitorNameCollected', 'should not re-ask name');
    assert.ok(plan.fieldTargeted !== 'serviceCollected',     'should not re-ask service');
    assert.ok(plan.fieldTargeted !== 'emergencyCollected',   'should not re-ask emergency');
    assert.equal(plan.fieldTargeted, 'phoneCollected', `expected phone, got: "${plan.questionToAsk}"`);
  });
});

// ─── State machine transition rules ──────────────────────────────────────────

describe('State machine — transition rules', () => {
  const emptyMem  = emptyMemory();
  const emptyScore = qualifyLead(emptyMem);

  it('greeting → discovery after first message', () => {
    const next = computeNextStage(
      'greeting',
      makeIntent('Hello'),
      emptyScore,
      emptyMem,
      1
    );
    assert.equal(next, 'discovery');
  });

  it('stays in greeting at turn 0', () => {
    const next = computeNextStage(
      'greeting',
      makeIntent(''),
      emptyScore,
      emptyMem,
      0
    );
    assert.equal(next, 'greeting');
  });

  it('booking intent → booking stage', () => {
    const next = computeNextStage(
      'discovery',
      makeIntent('I want to book an appointment'),
      emptyScore,
      emptyMem,
      2
    );
    assert.equal(next, 'booking');
  });

  it('does not re-enter booking when already in booking', () => {
    // booking is a terminal-ish stage — only goes to completed or escalated
    assert.equal(isValidTransition('booking', 'booking'), false);
    assert.equal(isValidTransition('booking', 'completed'), true);
    assert.equal(isValidTransition('booking', 'escalated'), true);
  });

  it('completed stage never transitions', () => {
    const next = computeNextStage(
      'completed',
      makeIntent('book me'),
      emptyScore,
      { ...emptyMem, bookingStatus: 'booked' },
      99
    );
    assert.equal(next, 'completed', 'completed is terminal');
  });

  it('escalated stage never transitions', () => {
    const next = computeNextStage(
      'escalated',
      makeIntent('book me'),
      emptyScore,
      emptyMem,
      5
    );
    assert.equal(next, 'escalated', 'escalated is terminal');
  });

  it('booking confirmed → completed', () => {
    const next = computeNextStage(
      'booking',
      makeIntent(''),
      emptyScore,
      { ...emptyMem, bookingStatus: 'booked' },
      5
    );
    assert.equal(next, 'completed');
  });

  it('booking transition is NOT triggered from discovery before booking intent', () => {
    const intent = makeIntent('What services do you offer?'); // Question intent, not Booking
    const next = computeNextStage('discovery', intent, emptyScore, emptyMem, 2);
    // Should stay in discovery (not enough turns for qualification, no booking intent)
    assert.ok(next !== 'booking', `Unexpected booking transition: got "${next}"`);
  });
});

// ─── Booking flow ─────────────────────────────────────────────────────────────

describe('Booking flow', () => {
  it('planner returns empty question in booking stage', () => {
    const plan = planNextMove({
      memory:   emptyRichMemory(),
      progress: emptyProgress(),
      stage:    'booking',
      industry: 'hvac',
      intent:   makeIntent(''),
    });
    assert.equal(plan.questionToAsk, '');
    assert.equal(plan.nextGoal, 'complete');
  });

  it('bookingStatus transitions from none → requested on booking intent', () => {
    const mem = emptyMemory();
    assert.equal(mem.bookingStatus, 'none');

    // Memory update: booking status is set by the orchestrator, not memory.ts
    // We verify the state machine would trigger the transition
    const intent = makeIntent('I want to book an appointment');
    const next = computeNextStage('discovery', intent, qualifyLead(mem), mem, 2);
    assert.equal(next, 'booking', 'should transition to booking on booking intent');
  });

  it('planner does not ask non-critical fields when user wants to book', () => {
    // User has name but not budget/timeline — they want to book right now
    const mem = updateMemoryFromMessage(
      emptyRichMemory(),
      'Carol',
      "What's your name?"
    ) as RichConversationMemory;

    const plan = planNextMove({
      memory:   mem,
      progress: mem.progress,
      stage:    'discovery',
      industry: 'hvac',
      intent:   makeIntent('I want to book an appointment now'),
      turnCount: 1,
    });

    // Should ask for service (critical) rather than non-critical fields
    // since booking intent is present, planner skips non-critical missing fields
    assert.ok(
      plan.priority === 'critical' || plan.nextGoal === 'complete',
      `Expected critical field or complete, got priority="${plan.priority}" goal="${plan.nextGoal}"`
    );
  });
});

// ─── FAQ interruption ─────────────────────────────────────────────────────────

describe('FAQ / question interruption', () => {
  it('memory is preserved when user asks an off-topic question', () => {
    let mem = updateMemoryFromMessage(
      emptyRichMemory(),
      'Dave',
      "What's your name?"
    ) as RichConversationMemory;

    // User asks an FAQ mid-conversation
    mem = updateMemoryFromMessage(
      mem,
      'How much does AC repair usually cost?',
      "What service do you need today?"
    ) as RichConversationMemory;

    // Name should still be Dave
    assert.equal(mem.visitorName, 'Dave', 'name should be preserved after FAQ interrupt');
    // No service extracted (FAQ is not a service answer)
    // service may or may not be set — but name must be intact
    assert.ok(mem.rich.visitorName.value === 'Dave');
  });

  it('planner resumes from correct next field after FAQ', () => {
    const mem = simulateHvacConversation([
      { ai: "What's your name?",          user: 'Eve' },
      { ai: "What service do you need?",  user: 'Do you offer weekend service?' }, // FAQ, not service answer
    ]) as RichConversationMemory;

    // Service may not have been extracted (it's a question, not an answer)
    // Planner should still target serviceCollected if not captured
    const plan = hvacPlan(mem, mem.progress, 2);
    assert.ok(
      plan.fieldTargeted === 'serviceCollected' || mem.progress.serviceCollected,
      `Expected service question or already collected, got: "${plan.questionToAsk}" targeting "${plan.fieldTargeted}"`
    );
  });
});

// ─── Objection handling ───────────────────────────────────────────────────────

describe('Objection handling', () => {
  it('objection intent transitions to objection stage', () => {
    const mem = { ...emptyMemory(), objections: ['too expensive'] };
    const intent = makeIntent("That's too expensive, not sure I can afford it");
    const next = computeNextStage('discovery', intent, qualifyLead(mem), mem, 3);
    assert.equal(next, 'objection');
  });

  it('objection without explicit signal stays in current stage', () => {
    const mem = emptyMemory(); // no objections array
    const intent = makeIntent('What services do you offer?');
    const next = computeNextStage('discovery', intent, qualifyLead(mem), mem, 3);
    // Should not jump to objection without an actual objection signal
    assert.ok(next !== 'objection', `Unexpected objection transition: got "${next}"`);
  });
});

// ─── Repeated answers ─────────────────────────────────────────────────────────

describe('Repeated answers — idempotent updates', () => {
  it('providing the same name twice does not create duplicates', () => {
    let mem = updateMemoryFromMessage(emptyRichMemory(), 'Frank', "What's your name?") as RichConversationMemory;
    mem = updateMemoryFromMessage(mem, 'Frank', "Just to confirm, what was your name?") as RichConversationMemory;
    assert.equal(mem.visitorName, 'Frank');
    assert.equal(mem.rich.visitorName.value, 'Frank');
  });

  it('providing a different name replaces only if higher confidence', () => {
    const base = updateMemoryFromMessage(emptyRichMemory(), 'Greg', "What's your name?") as RichConversationMemory;
    assert.ok(base.rich.visitorName.confidence >= 85);

    // Regex-level name extraction should not override contextual
    const updated = updateMemoryFromMessage(base, "Hi I'm Henry from Acme", "What company are you with?") as RichConversationMemory;
    assert.equal(updated.visitorName, 'Greg', 'contextual name should not be overridden by regex');
  });

  it('providing same service twice does not double-add to servicesDiscussed', () => {
    let mem = updateMemoryFromMessage(emptyRichMemory(), 'AC repair', "What service do you need?") as RichConversationMemory;
    mem = updateMemoryFromMessage(mem, 'AC repair', "Can you clarify what type of AC repair?") as RichConversationMemory;
    const count = mem.servicesDiscussed.filter(s => s === 'AC repair').length;
    assert.equal(count, 1, 'service should not be duplicated in servicesDiscussed');
  });
});

// ─── Invalid / unexpected input ───────────────────────────────────────────────

describe('Invalid / unexpected user input', () => {
  it('single character input does not crash memory update', () => {
    assert.doesNotThrow(() => {
      updateMemoryFromMessage(emptyRichMemory(), 'x', "What's your name?");
    });
  });

  it('empty-ish message does not extract anything', () => {
    const mem = updateMemoryFromMessage(emptyRichMemory(), '...', "What's your name?") as RichConversationMemory;
    // "..." is not a valid name
    assert.equal(mem.visitorName, null, 'dots should not be treated as a name');
  });

  it('very long message does not crash memory update', () => {
    const long = 'word '.repeat(500);
    assert.doesNotThrow(() => {
      updateMemoryFromMessage(emptyRichMemory(), long, "What's your name?");
    });
  });

  it('number-only input is not stored as company name', () => {
    const mem = updateMemoryFromMessage(emptyRichMemory(), '12345', "What company are you with?") as RichConversationMemory;
    assert.equal(mem.company, null, 'ZIP-like number should not be stored as company');
  });

  it('emoji-only input does not extract fields', () => {
    const mem = updateMemoryFromMessage(emptyRichMemory(), '👍', "What's your name?") as RichConversationMemory;
    assert.equal(mem.visitorName, null);
  });
});

// ─── Deterministic fallback (Gemini unavailable) ──────────────────────────────

describe('Deterministic fallback — Gemini unavailable', () => {
  it('planner always returns a question when fields remain uncollected', () => {
    const mem = emptyRichMemory();
    const plan = hvacPlan(mem, mem.progress, 0);
    assert.ok(plan.questionToAsk.length > 0, 'fallback must produce a question');
    assert.ok(plan.fieldTargeted !== null, 'fallback must target a field');
  });

  it('planner produces different questions for different progress states', () => {
    const q1 = hvacPlan(emptyRichMemory(), emptyProgress(), 0).questionToAsk;

    const partialMem = updateMemoryFromMessage(emptyRichMemory(), 'Ivan', "What's your name?") as RichConversationMemory;
    const q2 = hvacPlan(partialMem, partialMem.progress, 1).questionToAsk;

    assert.notEqual(q1, q2, 'different progress should produce different questions');
  });

  it('planner terminates within N turns for HVAC (no infinite loop)', () => {
    let mem = emptyRichMemory();
    const MAX_TURNS = 20;
    let turn = 0;

    const aiAnswers = [
      "What's your name?",
      "What service do you need?",
      "Is this an emergency?",
      "What's the best number to reach you?",
      "What's the service address?",
      "What day works best?",
    ];
    const userAnswers = ['Jane', 'Heating repair', 'No', '555-777-8888', '60601', 'Friday'];

    while (turn < MAX_TURNS) {
      const plan = hvacPlan(mem, mem.progress, turn);
      if (plan.nextGoal === 'complete') break;

      // Simulate user answering
      const aiQ = aiAnswers[turn] ?? plan.questionToAsk;
      const userA = userAnswers[turn] ?? 'Test answer';
      mem = updateMemoryFromMessage(mem, userA, aiQ) as RichConversationMemory;
      turn++;
    }

    assert.ok(turn < MAX_TURNS, `Conversation did not complete within ${MAX_TURNS} turns (infinite loop risk)`);
  });
});

// ─── No cross-field contamination ────────────────────────────────────────────

describe('No cross-field contamination', () => {
  it('phone number does not contaminate company field', () => {
    const mem = updateMemoryFromMessage(
      emptyRichMemory(),
      '555-123-4567',
      "What company are you with?"
    ) as RichConversationMemory;
    assert.equal(mem.company, null, 'phone number should not be stored as company');
    // Phone itself should be extracted by regex fallback
    assert.ok(mem.phone !== null, 'phone should be extracted by regex');
  });

  it('company name typed in response to phone question is not stored as phone', () => {
    const mem = updateMemoryFromMessage(
      emptyRichMemory(),
      'Acme Corp',
      "What phone number can we call?"
    ) as RichConversationMemory;
    // "Acme Corp" has no digits — must not be stored as phone
    assert.equal(mem.phone, null, 'company name should not be stored as phone');
    // It also should not be stored as company — the context asked for phone, not company
    // (This is the correct strict behavior: contextual extraction only stores to the asked field)
    assert.equal(mem.company, null, 'company name should not be stored when phone was asked');
  });

  it('appointment answer does not contaminate name field', () => {
    const mem = updateMemoryFromMessage(
      emptyRichMemory(),
      'Tomorrow morning',
      "What day and time works best for you?"
    ) as RichConversationMemory;
    assert.equal(mem.rich.preferredTime.value, 'Tomorrow morning');
    assert.equal(mem.visitorName, null, 'time answer should not be stored as name');
  });

  it('service answer does not contaminate name field', () => {
    const mem = updateMemoryFromMessage(
      emptyRichMemory(),
      'AC repair',
      "What service do you need today?"
    ) as RichConversationMemory;
    assert.equal(mem.rich.service.value, 'AC repair');
    assert.equal(mem.visitorName, null, 'service answer should not be stored as name');
  });
});

// ─── Industry detection ───────────────────────────────────────────────────────

describe('Industry detection', () => {
  it('detects HVAC from org industry', () => {
    const key = detectIndustry('HVAC', emptyRichMemory());
    assert.equal(key, 'hvac');
  });

  it('detects SaaS from org industry', () => {
    const key = detectIndustry('SaaS software', emptyRichMemory());
    assert.equal(key, 'saas');
  });

  it('falls back to general for unknown industry', () => {
    const key = detectIndustry('bakery', emptyRichMemory());
    assert.equal(key, 'general');
  });

  it('HVAC detected from service discussed in memory', () => {
    const mem = emptyRichMemory();
    mem.rich.service = { value: 'furnace repair', confidence: 90, source: 'context' };
    const key = detectIndustry('General', mem);
    assert.equal(key, 'hvac');
  });
});
