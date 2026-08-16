/**
 * guardrails.truncation.test.ts
 *
 * Regression coverage for the incomplete-reply safety net added to
 * checkOutput().
 *
 * Context: production replies were arriving cut off mid-sentence (e.g.
 * "What specific HVAC service are you"), and checkOutput() passed them
 * through as safe — it only knew about fabricated prices, invented
 * integrations, human-impersonation and advice claims. This is the
 * defence-in-depth check for that class of failure. It flags (safe: false)
 * rather than rewriting, so the underlying generation bug stays visible.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { checkOutput } from '../guardrails';

describe('checkOutput — truncated reply detection', () => {
  // The exact strings observed in production during the investigation.
  const realTruncatedReplies = [
    'Hi Priya, it\'s great to meet you! Welcome to Vijay Kumar\'s Organization—we\'re here to help keep your home comfortable year-round. \n\nWhat specific HVAC service are you',
    'Thanks for confirming your number, Priya! I\'ve made a note of it in our system. \n\nTo help',
    'Thanks for confirming that, Priya! I have your phone number saved, and our team will be able to reach out',
    'Let\'s acknowledge her phone number, confirm we got it, and ask about her timeline or preferred timeframe for',
  ];

  for (const reply of realTruncatedReplies) {
    it(`flags a real truncated reply: "${reply.slice(-32)}"`, () => {
      const result = checkOutput(reply);
      assert.equal(result.safe, false);
      assert.equal(result.reason, 'Reply appears truncated');
      // Detector, not rewriter — text must be passed through untouched.
      assert.equal(result.sanitized, reply);
    });
  }

  it('flags an empty reply', () => {
    const result = checkOutput('');
    assert.equal(result.safe, false);
    assert.equal(result.reason, 'Reply appears truncated');
  });

  it('flags a whitespace-only reply', () => {
    assert.equal(checkOutput('   \n  ').safe, false);
  });

  const completeReplies = [
    'Thanks for confirming your number, Priya! Our team will reach out shortly.',
    'What specific HVAC service are you looking for today?',
    'That sounds frustrating — let me get someone out to you!',
    'Sure, I can help with that...',
    'Our technician said "we can be there by noon."',
    'You\'re all set! 🎉',
    // Slot-list lead-in — a finished reply that ends on a colon.
    'Here are our next available times:',
  ];

  for (const reply of completeReplies) {
    it(`passes a complete reply: "${reply.slice(0, 34)}"`, () => {
      const result = checkOutput(reply);
      assert.equal(result.safe, true, `expected safe, got reason: ${result.reason}`);
    });
  }

  it('does not let the truncation check mask other guardrail failures', () => {
    // Fabricated pricing still wins the reason slot, and is still sanitized.
    const result = checkOutput('Our plan is $12,500 per month.');
    assert.equal(result.safe, false);
    assert.equal(result.reason, 'Pricing sanitized');
    assert.match(result.sanitized, /contact us for pricing/);
  });
});
