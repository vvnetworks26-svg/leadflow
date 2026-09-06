/**
 * conversation-state.legacyBooking.test.ts
 *
 * Regression coverage for the legacy-path half of the false-confirmation
 * incident (PR #28 fixed the Layer 4/5 path only — ResponsePlanner.ts /
 * Humanizer.ts). STAGE_INSTRUCTIONS['booking'] in conversation-state.ts is
 * the legacy prompt-builder path's equivalent guidance, and it still said
 * "Guide them to confirm the appointment" unconditionally, with no
 * bookingStatus === 'booked' check. Any conversation running the legacy
 * path (buildSystemPrompt, used whenever identity/blueprint/l3Plan isn't
 * available — see orchestrator.ts) that reached its 'booking' stage could
 * still produce a false confirmation.
 *
 * getStageInstructions() now gates that text on bookingStatus === 'booked',
 * mirroring the exact pattern used in ResponsePlanner.buildExamples() and
 * Humanizer.buildMustMention().
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { getStageInstructions, STAGE_INSTRUCTIONS } from '../conversation-state';
import { buildSystemPrompt, type OrgContext }        from '../prompt-builder';
import { checkOutput }                                from '../guardrails';
import { emptyMemory }                                from '../types';
import { qualifyLead }                                from '../qualification';

const testOrg: OrgContext = {
  name:           'Verify Fix HVAC',
  industry:       'hvac',
  timezone:       'America/New_York',
  services:       ['AC Repair'],
  aiTone:         'Friendly',
  welcomeMessage: 'Hi there!',
  enableEmergencyWorkflow: false,
  faqEntries:     [],
};

// Affirmative language that would tell the model to claim a booking exists.
// Deliberately narrow: the not-booked guidance text itself contains phrases
// like "appointment is booked or confirmed" as part of a *prohibition*
// ("Do NOT say the appointment is booked or confirmed"), so a loose pattern
// on those words alone would false-positive against the fix itself.
const CONFIRMATION_LANGUAGE = /\bconfirm the appointment details\b|\byou.?re all booked\b|\bthe booking is confirmed\b/i;

describe('getStageInstructions — legacy booking-stage gate', () => {
  it('does NOT tell the model to confirm the appointment when bookingStatus is "none"', () => {
    const instructions = getStageInstructions('booking', 'none');
    assert.doesNotMatch(instructions, CONFIRMATION_LANGUAGE);
    assert.match(instructions, /not been booked|do not say/i);
  });

  it('does NOT tell the model to confirm the appointment when bookingStatus is "requested"', () => {
    const instructions = getStageInstructions('booking', 'requested');
    assert.doesNotMatch(instructions, CONFIRMATION_LANGUAGE);
  });

  it('does NOT tell the model to confirm the appointment when bookingStatus is omitted', () => {
    const instructions = getStageInstructions('booking');
    assert.doesNotMatch(instructions, CONFIRMATION_LANGUAGE);
  });

  it('DOES tell the model to confirm the appointment once bookingStatus is "booked"', () => {
    const instructions = getStageInstructions('booking', 'booked');
    assert.match(instructions, CONFIRMATION_LANGUAGE);
  });

  it('leaves every non-booking stage untouched, regardless of bookingStatus', () => {
    for (const stage of Object.keys(STAGE_INSTRUCTIONS) as Array<keyof typeof STAGE_INSTRUCTIONS>) {
      if (stage === 'booking') continue;
      assert.equal(getStageInstructions(stage, 'booked'), STAGE_INSTRUCTIONS[stage]);
      assert.equal(getStageInstructions(stage, 'none'), STAGE_INSTRUCTIONS[stage]);
    }
  });
});

describe('legacy path (buildSystemPrompt) — booking stage, bookingStatus not "booked"', () => {
  it('produces no false-confirmation language in the assembled system prompt', () => {
    const memory = { ...emptyMemory(), bookingStatus: 'requested' as const };
    const score  = qualifyLead(memory);

    const { system } = buildSystemPrompt({
      org:             testOrg,
      stage:           'booking',
      memory,
      score,
      recommendations: [],
      knowledgeHits:   [],
    });

    assert.doesNotMatch(system, CONFIRMATION_LANGUAGE);
    assert.match(system, /CURRENT STAGE: BOOKING/);
  });

  it('does produce confirmation language once bookingStatus is actually "booked"', () => {
    const memory = { ...emptyMemory(), bookingStatus: 'booked' as const };
    const score  = qualifyLead(memory);

    const { system } = buildSystemPrompt({
      org:             testOrg,
      stage:           'booking',
      memory,
      score,
      recommendations: [],
      knowledgeHits:   [],
    });

    assert.match(system, CONFIRMATION_LANGUAGE);
  });
});

describe('checkOutput backstop — explicitly verified for the legacy path', () => {
  // Same incident-shaped reply used in guardrails.fakeBooking.test.ts. Proven
  // here specifically: checkOutput() operates on the final reply text alone
  // (aiReply, bookingStatus) with no notion of which path — legacy
  // buildSystemPrompt or Layer 4/5 PromptAssembler — produced that text, so
  // it backstops both. This is not assumed; it is exercised directly against
  // legacy-shaped output below.
  const legacyShapedFalseConfirmation =
    "You are all set! I have booked your AC service appointment for tomorrow at 7:00 PM. Our technician will see you then!";

  it('blocks a false confirmation even though nothing here is Layer-4/5-specific', () => {
    const result = checkOutput(legacyShapedFalseConfirmation, 'requested');
    assert.equal(result.safe, false);
    assert.equal(result.reason, 'Blocked fabricated booking confirmation');
    assert.notEqual(result.sanitized, legacyShapedFalseConfirmation);
  });

  it('lets the same shape of reply through once bookingStatus is genuinely "booked"', () => {
    const result = checkOutput(legacyShapedFalseConfirmation, 'booked');
    assert.equal(result.safe, true);
    assert.equal(result.sanitized, legacyShapedFalseConfirmation);
  });
});
