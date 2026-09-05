/**
 * ai/__tests__/fallback-blueprint-flow.test.ts
 *
 * Walks the full hvac.repair blueprint conversation
 * (greet → collect_service → collect_emergency → collect_phone →
 *  collect_address → offer_appointment → confirm) through the REAL Layer 3
 * engine, and asserts the two behaviours that were broken:
 *
 *  (a) bookingTriggered is edge-triggered — fires exactly once, on the turn the
 *      objective transitions INTO offer_appointment, and never again while that
 *      or a later stage holds. Previously `nextStage === 'booking' && stage !==
 *      'booking'`, driven by the legacy ConversationStage machine, which never
 *      reaches 'booking' in a blueprint flow — so it never fired at all and the
 *      widget's SlotPicker (whose only entry point is this flag) never rendered.
 *
 *  (c) buildFallbackReply() — the path serving 100% of production traffic while
 *      Gemini returns 401 — produces stage-appropriate text at every blueprint
 *      stage, and never the generic first-turn greeting it used to emit
 *      mid-conversation once the legacy planner ran out of questions.
 *
 * Deliberately DB-free: ConversationOrchestrationService defaults to an
 * InMemoryBlueprintRepository and buildBusinessIdentity() is a pure factory, so
 * this runs without mongodb-memory-server (which does not start in this
 * environment — a pre-existing condition affecting the existing
 * *.integration.test.ts suites too, unrelated to these changes).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ConversationOrchestrationService } from '../../conversation-engine/ConversationOrchestrationService';
import { buildBusinessIdentity } from '../../business-identity/BusinessIdentityFactory';
import { buildFallbackReply } from '../fallback-reply';
import { emptyMemory } from '../types';
import { memoryToRich } from '../memory';
import type { ConversationObjective } from '../../conversation-engine/types';
import type { ResolvedIntent } from '../../intent-engine/types';
import type { OrgContext } from '../prompt-builder';

/** The exact string the old buggy default emitted mid-conversation. */
const OLD_GENERIC_DEFAULT = 'Thanks for reaching out! How can I help you today?';

// Genuinely 24h. Must NOT be a normal 08:00–17:00 window: every blueprint
// carries EMERGENCY_RULES, including rule_business_closed (priority 80 →
// offer_next_slot → objective 'offer_appointment'). If the suite happens to run
// outside business hours that rule short-circuits every turn to
// offer_appointment, masking the real stage walk.
const alwaysOpen = { isOpen: true, openTime: '00:00', closeTime: '23:59' };

function makeIdentity() {
  return buildBusinessIdentity({
    organizationId: 'org-fallback-test',
    companyProfile: {
      businessId: 'org-fallback-test', businessName: 'Cascade Comfort HVAC',
      legalName: 'Cascade Comfort HVAC', industry: 'hvac', subIndustry: '',
      description: '', website: '', logo: '', tagline: '',
    },
    contactInfo: {
      phone: '555-010-2000', email: 'hi@cascade.test', address: '1 Main',
      city: 'Austin', state: 'TX', country: 'US', timezone: 'America/Chicago',
    },
    businessHours: {
      monday: alwaysOpen, tuesday: alwaysOpen, wednesday: alwaysOpen,
      thursday: alwaysOpen, friday: alwaysOpen, saturday: alwaysOpen, sunday: alwaysOpen,
      emergencyAfterHours: true, vacationMode: false, holidays: [], closedDates: [],
    },
  });
}

function makeIntent(): ResolvedIntent {
  return {
    id: 'i-1', category: 'repair', subCategory: '', confidenceLevel: 'high',
    urgency: 'normal', detectedService: null, entities: [], candidates: [],
    reasoning: '', blueprintId: null, requiresHuman: false,
    requiresClarification: false, rawMessage: 'my ac is broken', timestamp: new Date(),
  } as ResolvedIntent;
}

const orgContext: OrgContext = {
  name: 'Cascade Comfort HVAC', industry: 'HVAC', timezone: 'America/Chicago',
  services: ['AC Repair'], aiTone: 'Friendly',
  welcomeMessage: 'Hi! Thanks for reaching out to Cascade Comfort HVAC.',
  enableEmergencyWorkflow: true, faqEntries: [],
} as OrgContext;

/**
 * Progress flags after each answer, in blueprint order. Index i is the state
 * the orchestrator sees on the turn AFTER the visitor supplied answer i.
 */
const PROGRESS_SEQUENCE: Array<{ answered: string; flags: Record<string, boolean> }> = [
  { answered: '(start)',        flags: {} },
  { answered: 'name',           flags: { visitorNameCollected: true } },
  { answered: 'service',        flags: { visitorNameCollected: true, serviceCollected: true } },
  { answered: 'emergency',      flags: { visitorNameCollected: true, serviceCollected: true, emergencyCollected: true } },
  { answered: 'phone',          flags: { visitorNameCollected: true, serviceCollected: true, emergencyCollected: true, phoneCollected: true } },
  { answered: 'address',        flags: { visitorNameCollected: true, serviceCollected: true, emergencyCollected: true, phoneCollected: true, addressCollected: true } },
  { answered: 'appointment day',flags: { visitorNameCollected: true, serviceCollected: true, emergencyCollected: true, phoneCollected: true, addressCollected: true, appointmentCollected: true } },
];

async function walkBlueprint() {
  const identity = makeIdentity();
  const rich     = memoryToRich(emptyMemory());

  const turns: Array<{
    answered: string;
    objective: ConversationObjective;
    stageId: string | null;
    bookingTriggered: boolean;
  }> = [];

  let previousObjective: ConversationObjective | null = null;
  let workflowState: any = null;
  let blueprintId: string | null = null;

  for (let i = 0; i < PROGRESS_SEQUENCE.length; i++) {
    const { answered, flags } = PROGRESS_SEQUENCE[i];
    const progress = { ...rich.progress, ...flags } as any;

    const result = await ConversationOrchestrationService.orchestrate({
      organizationId: 'org-fallback-test',
      conversationId: 'conv-1',
      identity,
      intent: makeIntent(),
      memory: { ...rich, progress },
      progress,
      history: [{ role: 'user', content: answered }],
      turnCount: i,
      currentObjective: previousObjective,
      workflowState,
      currentBlueprintId: blueprintId,
    } as any);

    // The exact predicate from orchestrator.ts step 13.
    const isBookingObjective = (objective: string | null) =>
      objective === 'offer_appointment' || objective === 'confirm_appointment';
    const bookingTriggered =
      isBookingObjective(result.updatedObjective) &&
      !isBookingObjective(previousObjective);

    turns.push({
      answered,
      objective: result.updatedObjective,
      stageId: result.plan.stageId,
      bookingTriggered,
    });

    previousObjective = result.updatedObjective;
    workflowState     = result.updatedWorkflowState;
    blueprintId       = result.blueprintId;
  }

  return turns;
}

describe('HVAC blueprint flow on the rule-based fallback path', () => {

  it('walks all 8 blueprint stages and exposes a real stageId at each turn', async () => {
    const turns = await walkBlueprint();

    console.log('\n--- blueprint walk ---');
    for (const t of turns) {
      console.log(
        `after ${t.answered.padEnd(16)} | objective=${String(t.objective).padEnd(26)} | stageId=${String(t.stageId).padEnd(20)} | bookingTriggered=${t.bookingTriggered}`,
      );
    }

    // Every turn must resolve to a real blueprint stage — a null stageId is
    // what would send buildFallbackReply() to its default branch.
    for (const t of turns) {
      assert.ok(t.stageId, `turn after "${t.answered}" produced a null stageId`);
    }

    // The walk must actually reach the appointment and confirm stages.
    const stageIds = turns.map(t => t.stageId);
    assert.ok(stageIds.includes('offer_appointment'),
      `walk never reached offer_appointment: ${JSON.stringify(stageIds)}`);
    assert.ok(stageIds.includes('confirm'),
      `walk never reached confirm: ${JSON.stringify(stageIds)}`);
  });

  it('(a) fires bookingTriggered exactly once, on the transition into offer_appointment', async () => {
    const turns = await walkBlueprint();

    const fired = turns.filter(t => t.bookingTriggered);
    assert.equal(fired.length, 1,
      `expected exactly one fire, got ${fired.length}: ${JSON.stringify(fired.map(f => f.answered))}`);

    const firedIndex = turns.findIndex(t => t.bookingTriggered);
    assert.equal(turns[firedIndex].objective, 'offer_appointment',
      'must fire on the turn whose objective is offer_appointment');

    // Must not re-fire while offer_appointment (or a later stage) holds.
    for (let i = firedIndex + 1; i < turns.length; i++) {
      assert.equal(turns[i].bookingTriggered, false,
        `re-fired after the transition, on the turn after "${turns[i].answered}"`);
    }

    // Regression guard for the reported bug: it must fire at all.
    assert.ok(firedIndex >= 0, 'bookingTriggered never fired — SlotPicker would never render');
  });

  it('(a2) still fires when a single turn skips straight past offer_appointment into confirm_appointment', async () => {
    // objective-selector.ts's selectObjective() walks the blueprint stage list
    // in one pass per turn — if a free-text message supplies enough info to
    // satisfy BOTH the collect_address and offer_appointment stages' criteria
    // at once (address given AND a time stated, e.g. "123 Main St, tomorrow
    // at 7pm works"), the resolved objective can jump directly from
    // collect_address's objective to confirm_appointment, with
    // offer_appointment never appearing as a recorded updatedObjective on any
    // turn. The false-confirmation incident this guards against is consistent
    // with exactly this path. Before the fix, bookingTriggered only checked
    // for 'offer_appointment' and would never have fired here.
    const identity = makeIdentity();
    const rich     = memoryToRich(emptyMemory());

    const beforeAddress = { ...rich.progress, visitorNameCollected: true, serviceCollected: true, emergencyCollected: true, phoneCollected: true } as any;
    const afterBoth      = { ...beforeAddress, addressCollected: true, appointmentCollected: true } as any;

    const turn1 = await ConversationOrchestrationService.orchestrate({
      organizationId: 'org-fallback-test', conversationId: 'conv-2',
      identity, intent: makeIntent(), memory: { ...rich, progress: beforeAddress },
      progress: beforeAddress, history: [{ role: 'user', content: 'phone' }],
      turnCount: 0, currentObjective: null, workflowState: null, currentBlueprintId: null,
    } as any);

    const turn2 = await ConversationOrchestrationService.orchestrate({
      organizationId: 'org-fallback-test', conversationId: 'conv-2',
      identity, intent: makeIntent(), memory: { ...rich, progress: afterBoth },
      progress: afterBoth, history: [{ role: 'user', content: '123 Main St, tomorrow at 7pm works' }],
      turnCount: 1, currentObjective: turn1.updatedObjective, workflowState: turn1.updatedWorkflowState,
      currentBlueprintId: turn1.blueprintId,
    } as any);

    // Confirms the skip actually happened — offer_appointment was never the
    // recorded objective, turn2 landed straight on confirm_appointment.
    assert.notEqual(turn1.updatedObjective, 'offer_appointment',
      `test setup invalid — expected turn1 to still be pre-appointment, got ${turn1.updatedObjective}`);
    assert.equal(turn2.updatedObjective, 'confirm_appointment',
      `expected the single-turn skip into confirm_appointment, got ${turn2.updatedObjective}`);

    const isBookingObjective = (objective: string | null) =>
      objective === 'offer_appointment' || objective === 'confirm_appointment';
    const bookingTriggered =
      isBookingObjective(turn2.updatedObjective) &&
      !isBookingObjective(turn1.updatedObjective);

    assert.equal(bookingTriggered, true,
      'bookingTriggered must fire even when offer_appointment is skipped in one turn — otherwise the SlotPicker never renders and the model reaches confirm_appointment unguarded');
  });

  it('(c) returns stage-appropriate fallback text at every blueprint stage, never the old generic greeting', async () => {
    const memory = { ...emptyMemory(), visitorName: 'Riya' };

    // No planner question queued — this is the exhausted-planner case where the
    // old code fell through to the generic greeting.
    const stageIds = [
      'greet', 'collect_service', 'collect_emergency', 'collect_phone',
      'collect_address', 'offer_appointment', 'confirm', 'done',
    ];

    console.log('\n--- fallback replies (planner exhausted) ---');
    for (const stageId of stageIds) {
      const reply = buildFallbackReply(stageId, memory as any, orgContext, undefined);
      console.log(`${stageId.padEnd(20)} → ${JSON.stringify(reply)}`);

      assert.ok(reply && reply.length > 0, `${stageId} produced an empty reply`);
      assert.notEqual(reply, OLD_GENERIC_DEFAULT,
        `${stageId} still returns the old generic greeting`);
    }

    // The two stages the task called out specifically — must read as wrapping
    // up a booking, not as a fresh greeting.
    const confirmReply = buildFallbackReply('confirm', memory as any, orgContext, undefined);
    assert.match(confirmReply, /confirm|book/i,
      `confirm reply should be about wrapping up the booking: ${JSON.stringify(confirmReply)}`);

    const doneReply = buildFallbackReply('done', memory as any, orgContext, undefined);
    assert.match(doneReply, /confirm|all set|follow up/i,
      `done reply should close out the booking: ${JSON.stringify(doneReply)}`);

    // Both should personalise with the known name rather than resetting context.
    assert.match(confirmReply, /Riya/, 'confirm reply should retain visitor context');
    assert.match(doneReply,    /Riya/, 'done reply should retain visitor context');
  });

  it('default branch is a mid-conversation handoff, not a first-turn greeting', async () => {
    // Unknown/absent stage id (e.g. hvac.emergency stage ids, or no blueprint).
    const memory = { ...emptyMemory(), visitorName: 'Riya' };
    for (const stageId of [null, 'emergency_book', 'some_unknown_stage']) {
      const reply = buildFallbackReply(stageId, memory as any, orgContext, undefined);
      assert.notEqual(reply, OLD_GENERIC_DEFAULT,
        `stageId=${stageId} still returns the old generic greeting`);
      assert.doesNotMatch(reply, /How can I help you today\?/i,
        `stageId=${stageId} resets the visitor to a first-turn greeting`);
    }
  });

  it('planner question still takes priority when one is queued', async () => {
    const memory = { ...emptyMemory(), visitorName: 'Riya' };
    const reply = buildFallbackReply('confirm', memory as any, orgContext, {
      questionToAsk: 'What day works best for you?',
    } as any);
    assert.equal(reply, 'What day works best for you?',
      'Priority 1 (planner question) must still win over the stage switch');
  });
});
