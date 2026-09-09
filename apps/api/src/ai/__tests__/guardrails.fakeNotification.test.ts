/**
 * guardrails.fakeNotification.test.ts
 *
 * Regression test for the "false notification" bug — same class as the
 * false-booking-confirmation bug (#28/#29), but for claims that an
 * automated SMS/email/call was or will be sent. Confirmed separately:
 * zero real notifications are ever sent by any code path reachable from
 * live chat or booking — Twilio/Resend/WhatsApp are wired but unreachable
 * (env vars unset, no live caller) — so any such claim is false
 * unconditionally, including in the ONE case where a booking is
 * genuinely real (nothing sends a confirmation about it either).
 *
 * Proves three things independently, per the task's own instruction not
 * to assume fixing one path covers the others:
 *   1. ResponsePlanner.buildExamples() no longer claims a notification,
 *      even in its isBooked branch.
 *   2. ai/conversation-state.ts's STAGE_INSTRUCTIONS (legacy path) no
 *      longer permits/produces the claim.
 *   3. ai/fallback-reply.ts's rule-based 'done' case (used when Gemini is
 *      down) no longer claims one either.
 * Then proves the guardrail backstop independently of all three, working
 * even when a prompt fix is somehow bypassed — including the specific
 * case (bookingStatus === 'booked') where the booking-confirmation
 * guardrail intentionally stays silent but this one must not.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { checkOutput } from '../guardrails';
import { buildExamples } from '../../response-engine/ResponsePlanner';
import { STAGE_INSTRUCTIONS } from '../conversation-state';
import { buildFallbackReply } from '../fallback-reply';
import { emptyMemory } from '../types';
import type { OrgContext } from '../prompt-builder';

const orgContext: OrgContext = {
  name: 'Cascade Comfort HVAC', industry: 'HVAC', timezone: 'America/Chicago',
  services: ['AC Repair'], aiTone: 'Friendly',
  welcomeMessage: 'Hi! Thanks for reaching out.',
  enableEmergencyWorkflow: true, faqEntries: [],
} as OrgContext;

describe('checkOutput — fake notification claim detection', () => {
  const realShapeClaims = [
    "Perfect! You're all booked for AC Repair. You'll receive a confirmation shortly.",
    "We'll text you the details shortly.",
    "I've sent you a confirmation email with the appointment details.",
    "Check your email for a confirmation.",
    "You will receive a confirmation text within a few minutes.",
    "We'll email you once everything is set.",
  ];

  for (const reply of realShapeClaims) {
    it(`blocks a notification claim when bookingStatus is not booked: "${reply.slice(0, 40)}..."`, () => {
      const result = checkOutput(reply, 'requested');
      assert.equal(result.safe, false);
      assert.equal(result.reason, 'Blocked fabricated notification claim');
      assert.notEqual(result.sanitized, reply);
    });

    it(`ALSO blocks the same claim when bookingStatus IS booked (the real gap this closes): "${reply.slice(0, 40)}..."`, () => {
      const result = checkOutput(reply, 'booked');
      assert.equal(result.safe, false);
      assert.equal(result.reason, 'Blocked fabricated notification claim');
    });
  }

  const legitimateReplies = [
    "Perfect! You're all booked for AC Repair.",
    "Our team will be in touch shortly to follow up.",
    "Is there anything else I can help with?",
    "What day works best for you?",
  ];

  for (const reply of legitimateReplies) {
    it(`does not flag a legitimate reply: "${reply}"`, () => {
      const result = checkOutput(reply, 'booked');
      assert.equal(result.safe, true, `expected safe, reason: ${result.reason}`);
      assert.equal(result.sanitized, reply);
    });
  }

  it('does not shadow the truncation check', () => {
    const result = checkOutput('What specific HVAC service are you', 'none');
    assert.equal(result.safe, false);
    assert.equal(result.reason, 'Reply appears truncated');
  });
});

describe('Path 1 — ResponsePlanner.buildExamples() no longer claims a notification', () => {
  it('confirm_appointment example, bookingStatus booked, passes the guardrail clean', () => {
    const [example] = buildExamples({
      objective: 'confirm_appointment', visitorName: 'Siri', service: 'AC Repair', bookingStatus: 'booked',
    });
    const result = checkOutput(example, 'booked');
    assert.equal(result.safe, true, `example still trips the guardrail: "${example}"`);
    assert.doesNotMatch(example, /receive a confirmation|we'll (?:text|email) you/i);
  });
});

describe('Path 2 — ai/conversation-state.ts STAGE_INSTRUCTIONS no longer permits the claim', () => {
  it('the completed stage instruction explicitly forbids claiming an automated notification', () => {
    assert.match(STAGE_INSTRUCTIONS.completed, /do not claim.*confirmation.*text.*email.*call/i);
  });

  it('no stage instruction contains the removed claim language itself', () => {
    for (const [stage, text] of Object.entries(STAGE_INSTRUCTIONS)) {
      assert.doesNotMatch(text, /you(?:'ll| will) receive a confirmation/i, `stage "${stage}" contains a notification claim`);
    }
  });
});

describe('Path 3 — ai/fallback-reply.ts no longer claims a notification', () => {
  it("'done' case, bookingStatus booked, passes the guardrail clean", () => {
    const memory = { ...emptyMemory(), visitorName: 'Siri', bookingStatus: 'booked' as const };
    const reply = buildFallbackReply('done', memory as any, orgContext, undefined);
    const result = checkOutput(reply, 'booked');
    assert.equal(result.safe, true, `fallback reply still trips the guardrail: "${reply}"`);
    assert.doesNotMatch(reply, /will follow up shortly with the details|receive a confirmation/i);
  });
});
