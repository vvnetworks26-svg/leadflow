/**
 * guardrails.fakeBooking.test.ts
 *
 * Regression coverage for the false-confirmation incident: the AI told a
 * real visitor "You are all set, Siri! I have booked your AC service
 * appointment for tomorrow at 7:00 PM..." with no POST /book call ever made
 * and no Lead/Appointment ever created. Root cause was prompt guidance
 * (ResponsePlanner.buildExamples / Humanizer.buildMustMention) that told
 * Gemini to claim a booking was confirmed regardless of whether one existed.
 * That guidance is now gated on memory.bookingStatus === 'booked'.
 *
 * This is the defence-in-depth backstop for when the model doesn't follow
 * that guidance anyway: checkOutput() must catch booking-confirmation-shaped
 * replies when bookingStatus isn't 'booked', and must leave them alone when
 * it is.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { checkOutput } from '../guardrails';

describe('checkOutput — fake booking confirmation detection', () => {
  // The exact message from the incident (paraphrased length, same shape).
  const realFakeConfirmation =
    "You are all set, Siri! I have booked your AC service appointment for tomorrow at 7:00 PM. Our technician will see you then!";

  it('blocks the real incident message when bookingStatus is not booked', () => {
    const result = checkOutput(realFakeConfirmation, 'requested');
    assert.equal(result.safe, false);
    assert.equal(result.reason, 'Blocked fabricated booking confirmation');
    assert.notEqual(result.sanitized, realFakeConfirmation);
    assert.match(result.sanitized, /availability|scheduling/i);
  });

  it('blocks the same shape of message when bookingStatus is "none"', () => {
    const result = checkOutput(realFakeConfirmation, 'none');
    assert.equal(result.safe, false);
    assert.equal(result.reason, 'Blocked fabricated booking confirmation');
  });

  it('defaults to the strict (not-booked) check when bookingStatus is omitted', () => {
    // Backward compatibility: existing callers (and the truncation test
    // suite) call checkOutput() with a single argument.
    const result = checkOutput(realFakeConfirmation);
    assert.equal(result.safe, false);
    assert.equal(result.reason, 'Blocked fabricated booking confirmation');
  });

  it('does NOT fire when bookingStatus is actually booked', () => {
    const result = checkOutput(realFakeConfirmation, 'booked');
    assert.equal(result.safe, true);
    assert.equal(result.sanitized, realFakeConfirmation);
    assert.notEqual(result.reason, 'Blocked fabricated booking confirmation');
  });

  const otherRealShapeVariants = [
    "Perfect, TestRepro! You're all booked for AC Repair on Monday at 3pm. You'll receive a confirmation shortly.",
    "Your appointment is confirmed for tomorrow at 7:00 PM.",
    "Great news — the booking is confirmed for Friday at 9am!",
    "You're booked for 2pm tomorrow.",
    // Real fallback-reply.ts 'done' template (pre-fix) — no time/day restated
    // at all, caught only because "your appointment is confirmed" has no
    // legitimate non-booking reading and fires on its own.
    "You're all set, Siri! Your appointment is confirmed and Verify Fix HVAC will follow up shortly with the details. Anything else I can help with?",
  ];

  for (const reply of otherRealShapeVariants) {
    it(`blocks another confirmation-shaped reply: "${reply.slice(0, 40)}..."`, () => {
      const result = checkOutput(reply, 'requested');
      assert.equal(result.safe, false, `expected unsafe, reply: ${reply}`);
      assert.equal(result.reason, 'Blocked fabricated booking confirmation');
    });
  }

  const legitimateNonConfirmations = [
    // Confirmation-shaped phrasing with no time/day — common, harmless closer.
    "You're all set! Someone from our team will follow up.",
    // Time/day reference with no confirmation phrasing — a normal question.
    'Does tomorrow at 7pm work for you?',
    'What day works best for you?',
    // Pending/future-tense language — not yet claiming anything is done.
    "Wonderful! We are ready to confirm the booking for your house during our available business hours. What day works best for you?",
    // Availability-pull language — what the fixed prompt now produces instead.
    "Let's get that locked in — pulling up our real scheduling options now so you can pick a time that works.",
  ];

  for (const reply of legitimateNonConfirmations) {
    it(`does not flag a legitimate non-confirmation reply: "${reply.slice(0, 40)}..."`, () => {
      const result = checkOutput(reply, 'requested');
      assert.equal(result.safe, true, `expected safe, reason: ${result.reason}, reply: ${reply}`);
      assert.equal(result.sanitized, reply);
    });
  }

  it('still fires the existing truncation check independently (regression: new check does not shadow it)', () => {
    const result = checkOutput('What specific HVAC service are you', 'requested');
    assert.equal(result.safe, false);
    assert.equal(result.reason, 'Reply appears truncated');
  });
});
