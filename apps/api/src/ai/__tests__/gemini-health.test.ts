/**
 * gemini-health.test.ts
 *
 * Proves checkGeminiHealth() — the startup check that catches a dead/renamed
 * GEMINI_MODEL at boot instead of turn-by-turn via the silent rule-based
 * fallback — actually resolves on success and rejects (with the model name
 * in the message) on failure. Uses the setGeminiClient() DI seam so no live
 * network call happens in this suite.
 */

import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { GoogleGenerativeAI } from '@google/generative-ai';
import { checkGeminiHealth, setGeminiClient, handleGeminiHealthFailure } from '../gemini';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

describe('checkGeminiHealth()', () => {
  // checkGeminiHealth() no-ops when GEMINI_API_KEY is absent (intentional
  // fallback-only mode) — force it "configured" here so this test doesn't
  // depend on whether the ambient .env happens to have a real key set.
  let originalApiKey: string;

  before(() => {
    originalApiKey = env.GEMINI_API_KEY;
    (env as { GEMINI_API_KEY: string }).GEMINI_API_KEY = 'test-key-for-health-check';
  });

  after(() => {
    (env as { GEMINI_API_KEY: string }).GEMINI_API_KEY = originalApiKey;
    setGeminiClient(null);
  });

  it('resolves when the configured model responds successfully', async () => {
    setGeminiClient({
      getGenerativeModel: () => ({
        generateContent: async () => ({ response: { text: () => 'pong' } }),
      }),
    } as unknown as GoogleGenerativeAI);

    await assert.doesNotReject(() => checkGeminiHealth());
  });

  it('rejects with the model name in the error message when the call fails', async () => {
    setGeminiClient({
      getGenerativeModel: () => ({
        generateContent: async () => {
          throw new Error('[GoogleGenerativeAI Error]: 404 model not found');
        },
      }),
    } as unknown as GoogleGenerativeAI);

    await assert.rejects(
      () => checkGeminiHealth(),
      (err: Error) => {
        assert.match(err.message, new RegExp(env.GEMINI_MODEL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        assert.match(err.message, /404 model not found/);
        return true;
      },
    );
  });
});

describe('handleGeminiHealthFailure() — environment-aware boot policy', () => {
  it('staging/CI config (isProd=false) + broken model → rethrows, failing the boot', () => {
    const errorMock = mock.method(logger, 'error', () => {});
    try {
      const brokenModelErr = new Error('[Gemini] Startup health check failed for model "broken-model-xyz": 404 not found');
      assert.throws(
        () => handleGeminiHealthFailure(brokenModelErr, false),
        (err: Error) => err === brokenModelErr,
      );
      assert.equal(errorMock.mock.calls.length, 1, 'must still log the failure before rethrowing');
      const [logPayload] = errorMock.mock.calls[0].arguments as [any];
      assert.equal(logPayload.err, brokenModelErr);
    } finally {
      errorMock.mock.restore();
    }
  });

  it('production config (isProd=true) + broken model → does not throw, error is logged, boot continues', () => {
    const errorMock = mock.method(logger, 'error', () => {});
    try {
      const brokenModelErr = new Error('[Gemini] Startup health check failed for model "broken-model-xyz": 404 not found');
      assert.doesNotThrow(() => handleGeminiHealthFailure(brokenModelErr, true));
      assert.equal(errorMock.mock.calls.length, 1, 'failure must still be logged even though boot continues');
      const [logPayload] = errorMock.mock.calls[0].arguments as [any];
      assert.equal(logPayload.err, brokenModelErr);
    } finally {
      errorMock.mock.restore();
    }
  });
});
