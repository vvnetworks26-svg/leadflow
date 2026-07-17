/**
 * Unit tests for ai/memory.ts (v2 Smart Memory Engine)
 * Uses Node.js built-in test runner — no external dependencies.
 *
 * Run: node --loader ts-node/esm --experimental-specifier-resolution=node \
 *        src/ai/__tests__/memory.test.ts
 * Or via: npx tsx src/ai/__tests__/memory.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { updateMemoryFromMessage, syncProgressFromMemory, memoryToRich } from '../memory';
import { emptyMemory } from '../types';

// ─── Contextual extraction ────────────────────────────────────────────────────

describe('Contextual extraction — name', () => {
  it('extracts a plain first name when the AI asked for a name', () => {
    const mem = updateMemoryFromMessage(
      emptyMemory(),
      'John',
      "What's your name?"
    );
    assert.equal(mem.visitorName, 'John');
    assert.ok(mem.rich.visitorName.confidence >= 85, `confidence was ${mem.rich.visitorName.confidence}`);
    assert.equal(mem.rich.visitorName.source, 'context');
  });

  it('extracts a full name when the AI asked for a name', () => {
    const mem = updateMemoryFromMessage(
      emptyMemory(),
      'Sarah Johnson',
      "Can I get your name?"
    );
    assert.equal(mem.visitorName, 'Sarah Johnson');
  });

  it('does not confuse a service answer with a name', () => {
    const mem = updateMemoryFromMessage(
      emptyMemory(),
      'AC repair',
      "What service do you need today?"
    );
    assert.equal(mem.visitorName, null);
    assert.equal(mem.rich.service.value, 'AC repair');
  });
});

describe('Contextual extraction — company', () => {
  it('extracts company name from a direct short answer', () => {
    const mem = updateMemoryFromMessage(
      emptyMemory(),
      'VV Networks',
      "What company are you with?"
    );
    assert.equal(mem.company, 'VV Networks');
    assert.ok(mem.rich.company.confidence >= 85);
    assert.equal(mem.rich.company.source, 'context');
  });

  it('handles preamble "I work for"', () => {
    const mem = updateMemoryFromMessage(
      emptyMemory(),
      "I work for Acme Corp",
      "Who do you work for?"
    );
    assert.ok(mem.company !== null, 'company should be extracted');
  });
});

describe('Contextual extraction — phone', () => {
  it('extracts phone when AI asked for a number', () => {
    const mem = updateMemoryFromMessage(
      emptyMemory(),
      '555-123-4567',
      "What's the best number to reach you?"
    );
    assert.ok(mem.phone !== null, 'phone should be set');
    assert.ok(mem.rich.phone.confidence >= 85);
  });

  it('extracts phone with natural preamble', () => {
    const mem = updateMemoryFromMessage(
      emptyMemory(),
      'my number is 555-987-6543',
      "What phone number can we reach you at?"
    );
    assert.ok(mem.phone !== null, 'phone should be set');
  });
});

describe('Contextual extraction — service', () => {
  it('captures service request from direct answer', () => {
    const mem = updateMemoryFromMessage(
      emptyMemory(),
      'Furnace repair',
      "What service do you need today?"
    );
    assert.equal(mem.rich.service.value, 'Furnace repair');
    assert.ok(mem.rich.service.confidence >= 80);
  });
});

describe('Contextual extraction — emergency', () => {
  it('marks emergency = true on affirmative', () => {
    const mem = updateMemoryFromMessage(
      emptyMemory(),
      'yes, no heat at all',
      "Is this an emergency?"
    );
    assert.equal(mem.rich.emergency.value, true);
  });

  it('marks emergency = false on negative', () => {
    const mem = updateMemoryFromMessage(
      emptyMemory(),
      'No, not really urgent',
      "Is this an emergency situation?"
    );
    assert.equal(mem.rich.emergency.value, false);
  });
});

// ─── Regex extraction fallback ────────────────────────────────────────────────

describe('Regex extraction fallback', () => {
  it('extracts email without contextual hint', () => {
    const mem = updateMemoryFromMessage(
      emptyMemory(),
      'you can reach me at john@example.com',
      undefined
    );
    assert.equal(mem.email, 'john@example.com');
    assert.equal(mem.rich.email.source, 'regex');
  });

  it('extracts ZIP code without contextual hint', () => {
    const mem = updateMemoryFromMessage(
      emptyMemory(),
      'I am in 90210',
      undefined
    );
    assert.ok(mem.rich.zip.value === '90210' || mem.rich.address.value === '90210');
  });
});

// ─── Memory merge engine ──────────────────────────────────────────────────────

describe('Memory merge — confidence rules', () => {
  it('does NOT overwrite high-confidence value with lower-confidence value', () => {
    // Simulate: name was captured contextually (confidence=90)
    const firstTurn = updateMemoryFromMessage(
      emptyMemory(),
      'Alice',
      "What's your name?"
    );
    assert.equal(firstTurn.visitorName, 'Alice');
    assert.ok(firstTurn.rich.visitorName.confidence >= 85);

    // Second turn: a regex-level extraction (confidence=80) should not overwrite
    const secondTurn = updateMemoryFromMessage(
      firstTurn,
      "Hi I'm Bob from Acme",
      "Tell me about your company"
    );
    // Alice should be preserved since confidence(Alice) >= confidence(Bob via regex)
    assert.equal(secondTurn.visitorName, 'Alice', 'high-confidence name should be preserved');
  });

  it('DOES overwrite low-confidence value with higher-confidence value', () => {
    // Start with a regex-detected name (low confidence)
    const base = memoryToRich(emptyMemory());
    base.rich.visitorName = { value: 'Bob', confidence: 55, source: 'regex' };
    base.visitorName = 'Bob';

    // Contextual extraction should win (confidence=90)
    const updated = updateMemoryFromMessage(
      base,
      'Alice',
      "What's your name?"
    );
    assert.equal(updated.visitorName, 'Alice', 'higher-confidence value should replace lower');
    assert.ok(updated.rich.visitorName.confidence > 55);
  });

  it('never overwrites existing value with null', () => {
    const base = updateMemoryFromMessage(
      emptyMemory(),
      'John',
      "What's your name?"
    );
    const secondTurn = updateMemoryFromMessage(
      base,
      'The furnace is making noise',
      "What's the issue?"
    );
    assert.equal(secondTurn.visitorName, 'John', 'name should be preserved when not mentioned again');
  });
});

// ─── Progress sync ────────────────────────────────────────────────────────────

describe('ConversationProgress sync', () => {
  it('sets visitorNameCollected after name is captured', () => {
    const mem = updateMemoryFromMessage(
      emptyMemory(),
      'John',
      "What's your name?"
    );
    assert.equal(mem.progress.visitorNameCollected, true);
  });

  it('sets phoneCollected after phone is captured', () => {
    const mem = updateMemoryFromMessage(
      emptyMemory(),
      '555-000-1234',
      "What's the best number to reach you?"
    );
    assert.equal(mem.progress.phoneCollected, true);
  });

  it('sets serviceCollected after service is captured', () => {
    const mem = updateMemoryFromMessage(
      emptyMemory(),
      'AC installation',
      "What service do you need?"
    );
    assert.equal(mem.progress.serviceCollected, true);
  });
});

// ─── Duplicate question prevention (via progress) ─────────────────────────────

describe('Duplicate question prevention', () => {
  it('progress.visitorNameCollected prevents planner from asking for name again', () => {
    const { planNextMove } = require('../conversation-planner');
    const { detectIndustry } = require('../industry-profiles');

    const mem = updateMemoryFromMessage(
      emptyMemory(),
      'Alice',
      "What's your name?"
    );
    assert.equal(mem.progress.visitorNameCollected, true);

    const industry = detectIndustry('hvac', mem);
    const plan = planNextMove({
      memory:    mem,
      progress:  mem.progress,
      stage:     'discovery',
      industry,
      intent:    { intent: 'Unknown', confidence: 20, subIntents: [], rawText: '' },
      turnCount: 1,
    });

    // The plan must NOT ask for a name
    assert.ok(
      !plan.questionToAsk.toLowerCase().includes("what's your name") &&
      !plan.questionToAsk.toLowerCase().includes("your name"),
      `Plan should not ask for name again, got: "${plan.questionToAsk}"`
    );
  });
});

// ─── Appointment / preferredTime extraction ───────────────────────────────────

describe('Contextual extraction — preferredTime', () => {
  const appointmentQuestions = [
    "What day and time works best for you?",
    "What time works best?",
    "Which day works best?",
    "When would you like to schedule?",
    "When works best for you?",
    "Today or tomorrow?",
    "Do you have a preferred day or time?",
    "When would you like us to come out?",
  ];

  const appointmentAnswers = [
    "Today at 3pm",
    "Tomorrow morning",
    "Monday at 10",
    "Anytime after 5",
    "Tomorrow",
    "This weekend",
    "Friday afternoon",
  ];

  for (const question of appointmentQuestions) {
    it(`recognizes appointment question: "${question}"`, () => {
      const mem = updateMemoryFromMessage(
        emptyMemory(),
        'Tomorrow afternoon',
        question
      );
      assert.ok(
        mem.rich.preferredTime.value !== null,
        `preferredTime should be set for question: "${question}"`
      );
      assert.equal(mem.rich.preferredTime.source, 'context');
    });
  }

  for (const answer of appointmentAnswers) {
    it(`captures appointment answer: "${answer}"`, () => {
      const mem = updateMemoryFromMessage(
        emptyMemory(),
        answer,
        "What day and time works best for you?"
      );
      assert.ok(
        mem.rich.preferredTime.value !== null,
        `preferredTime should be set for answer: "${answer}"`
      );
      assert.equal(mem.rich.preferredTime.value, answer);
    });
  }
});

// ─── Cross-field contamination prevention ─────────────────────────────────────

describe('No cross-field contamination', () => {
  it('company question → company answer (not phone)', () => {
    const mem = updateMemoryFromMessage(
      emptyMemory(),
      'Acme Corp',
      "What company are you with?"
    );
    assert.equal(mem.company, 'Acme Corp');
    assert.equal(mem.phone, null, 'phone should not be set');
  });

  it('phone question → phone answer (not company)', () => {
    const mem = updateMemoryFromMessage(
      emptyMemory(),
      '555-123-4567',
      "What phone number can our technician call?"
    );
    assert.ok(mem.phone !== null, 'phone should be set');
    assert.equal(mem.company, null, 'company should not be set from a phone number');
  });

  it('company question → numeric answer is rejected as company', () => {
    const mem = updateMemoryFromMessage(
      emptyMemory(),
      '555-123-4567',
      "What company are you with?"
    );
    // A phone number should NOT be stored as company name
    assert.equal(
      mem.company, null,
      `company should not be set to a phone number, got: "${mem.company}"`
    );
  });

  it('company question → ZIP code is rejected as company', () => {
    const mem = updateMemoryFromMessage(
      emptyMemory(),
      '90210',
      "What company are you with?"
    );
    assert.equal(
      mem.company, null,
      `company should not be set to a ZIP code, got: "${mem.company}"`
    );
  });

  it('employee count question → "20 employees" extracted correctly, not as company', () => {
    const mem = updateMemoryFromMessage(
      emptyMemory(),
      '20 employees',
      "How many people are on your team?"
    );
    assert.equal(mem.employeeCount, '20');
    assert.equal(mem.company, null, 'company should not be set from employee count answer');
  });

  it('appointment question → time answer does not contaminate other fields', () => {
    const mem = updateMemoryFromMessage(
      emptyMemory(),
      'Today at 3pm',
      "What day and time works best for you?"
    );
    assert.equal(mem.rich.preferredTime.value, 'Today at 3pm');
    assert.equal(mem.company, null);
    assert.equal(mem.phone, null);
    assert.equal(mem.visitorName, null);
  });

  it('stale context does not bleed into next turn', () => {
    // Turn 1: AI asks for company, user answers
    const turn1 = updateMemoryFromMessage(
      emptyMemory(),
      'VV Networks',
      "What company are you with?"
    );
    assert.equal(turn1.company, 'VV Networks');

    // Turn 2: AI asks about the service issue — entirely different question
    // The user's reply should NOT be treated as a company answer
    const turn2 = updateMemoryFromMessage(
      turn1,
      'My AC stopped working',
      "What's the issue with your system?"
    );
    // Company should still be VV Networks (from turn 1), not overwritten
    assert.equal(turn2.company, 'VV Networks');
    // Service should be extracted from the new context
    assert.ok(turn2.rich.service.value !== null, 'service should be captured');
  });
});
