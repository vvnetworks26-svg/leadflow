/**
 * ai/gemini.ts
 *
 * Gemini LLM transport layer.
 * This is the ONLY file that talks to the Google Generative AI SDK.
 * All conversation logic lives in the orchestrator.
 *
 * Exposes a single sendMessage() function that:
 *   - Assembles the Gemini chat history
 *   - Prepends the system prompt as the first user turn (Gemini's preferred pattern)
 *   - Returns a plain string reply
 *   - Handles errors gracefully — never throws to callers
 */

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import type { ChatMessage } from './types';
import { env } from '../config/env';
import { logger } from '../utils/logger';

// ─── Client singleton ─────────────────────────────────────────────────────────

let _client: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!_client) {
    if (!env.GEMINI_API_KEY) {
      throw new Error('[Gemini] GEMINI_API_KEY is not configured');
    }
    _client = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  }
  return _client;
}

/**
 * Override the Gemini client (for testing). Pass null to reset to the
 * default lazily-constructed singleton on next use.
 */
export function setGeminiClient(client: GoogleGenerativeAI | null): void {
  _client = client;
}

// ─── Safety settings ──────────────────────────────────────────────────────────

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

// ─── Thinking configuration ───────────────────────────────────────────────────

/**
 * Turns Gemini 3.x's reasoning pass off for this call.
 *
 * Why this exists: `maxOutputTokens` is a SHARED budget — thinking tokens and
 * answer tokens both draw from it. Left at its default, gemini-3.6-flash spent
 * 440–575 of our 600-token budget on thinking and had ~20 left for the actual
 * reply, so replies routinely came back cut off mid-sentence ("What specific
 * HVAC service are you") or empty. Measured directly: default runs report
 * thoughtsTokenCount 443–573; with this config it is 0.
 *
 * Shape notes (verified against the live API, not assumed):
 *   - `thinkingConfig.thinkingLevel` is the accepted form. A FLAT
 *     `thinking_level` / `thinkingLevel` on generationConfig — which parts of
 *     Google's docs show — is rejected with 400 "Cannot find field".
 *   - `minimal` is the floor for 3.x; there is no "off" value, but it yields
 *     thoughtsTokenCount 0 in practice. The 2.5-era `thinkingBudget: 0` does
 *     not apply to 3.x.
 *   - `minimal` is NOT this model's default, despite doc claims to the
 *     contrary — the default measurably thinks.
 *
 * Cast: @google/generative-ai@0.21.0 predates thinking models so its
 * GenerationConfig type has no `thinkingConfig`, but the SDK never whitelists
 * fields — it JSON.stringify()s the request wholesale — so the key reaches the
 * REST API intact. The cast is a types-only workaround, not a behavioural one.
 */
const THINKING_OFF = { thinkingConfig: { thinkingLevel: 'minimal' } } as unknown as Record<string, unknown>;

// ─── Public API ───────────────────────────────────────────────────────────────

export interface GeminiRequest {
  systemPrompt:   string;
  knowledgeBlock: string;   // injected as first user message
  history:        ChatMessage[];
  userMessage:    string;
  modelName?:     string;   // defaults to env.GEMINI_MODEL
  maxTokens?:     number;
}

export interface GeminiResponse {
  text:    string;
  success: boolean;
  error?:  string;
  tokens?: number;
}

/**
 * Send a message to Gemini and return the text reply.
 * Never throws — returns { success: false, text: '' } on failure.
 */
export async function sendToGemini(req: GeminiRequest): Promise<GeminiResponse> {
  try {
    const client = getClient();
    const model  = client.getGenerativeModel({
      model:          req.modelName ?? env.GEMINI_MODEL,
      safetySettings: SAFETY_SETTINGS,
      generationConfig: {
        maxOutputTokens: req.maxTokens ?? 512,
        temperature:     0.7,
        topP:            0.9,
        topK:            40,
        ...THINKING_OFF,
      },
    });

    // Build Gemini-compatible history
    // System prompt is prepended as a user → model exchange
    const history = [
      // System context as first exchange
      {
        role:  'user',
        parts: [{ text: `[SYSTEM INSTRUCTIONS]\n${req.systemPrompt}${req.knowledgeBlock ? '\n\n' + req.knowledgeBlock : ''}` }],
      },
      {
        role:  'model',
        parts: [{ text: 'Understood. I\'m ready to help.' }],
      },
      // Prior conversation
      ...req.history.map(m => ({
        role:  m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      })),
    ];

    const chat  = model.startChat({ history });
    const result = await chat.sendMessage(req.userMessage);
    const text   = result.response.text();

    return {
      text,
      success: true,
      tokens:  result.response.usageMetadata?.totalTokenCount,
    };
  } catch (err: any) {
    logger.error({ err }, '[Gemini] sendMessage failed');
    return {
      text:    '',
      success: false,
      error:   err?.message ?? 'Unknown Gemini error',
    };
  }
}

/**
 * Check if Gemini is configured (API key present).
 */
export function isGeminiConfigured(): boolean {
  return Boolean(env.GEMINI_API_KEY);
}

/**
 * Startup health check — makes one lightweight real call to the configured
 * Gemini model so a dead/renamed model string (env.GEMINI_MODEL) is caught
 * at deploy time instead of discovered turn-by-turn via the silent
 * rule-based fallback in runOrchestrator().
 *
 * No-op when Gemini isn't configured at all (GEMINI_API_KEY absent) — that's
 * intentional fallback-only mode, not a failure.
 *
 * Throws on failure — mirrors connectDatabase()'s throw-and-let-the-caller-
 * decide pattern. See handleGeminiHealthFailure() below for what the caller
 * (server.ts) does with that failure.
 */
export async function checkGeminiHealth(): Promise<void> {
  if (!isGeminiConfigured()) return;

  const client = getClient();
  const model  = client.getGenerativeModel({ model: env.GEMINI_MODEL });

  try {
    await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
      generationConfig: { maxOutputTokens: 5 },
    });
    logger.info({ model: env.GEMINI_MODEL }, '[Gemini] Startup health check passed');
  } catch (err: any) {
    throw new Error(
      `[Gemini] Startup health check failed for model "${env.GEMINI_MODEL}": ${err?.message ?? 'Unknown error'}`,
    );
  }
}

/**
 * Decides what a checkGeminiHealth() failure means for the boot process.
 * Extracted from server.ts as a pure function so the environment-aware
 * branch is directly unit-testable without booting the real app (server.ts
 * calls start() as an import-time side effect).
 *
 * Reuses env.isProd — the same NODE_ENV flag requireInProd() already keys
 * off in config/env.ts — rather than a second environment-detection
 * mechanism. Deliberately the OPPOSITE polarity from requireInProd() (which
 * is strict only in production): production stays resilient/non-fatal, and
 * every non-production environment (development, test — the bucket
 * staging/CI runs in today, since this codebase has no dedicated "staging"
 * NODE_ENV value) fails the boot outright. Always logs at error level
 * first, in both branches, so the failure is visible either way.
 *
 * @throws the original error when isProd is false — the caller must let
 *         this propagate so the process exits (see server.ts's start().catch()).
 */
export function handleGeminiHealthFailure(err: unknown, isProd: boolean): void {
  if (isProd) {
    logger.error({ err, model: env.GEMINI_MODEL }, 'Server starting — Gemini health check failed, conversations will use the rule-based fallback until this is fixed');
    return;
  }
  logger.error({ err, model: env.GEMINI_MODEL, nodeEnv: env.NODE_ENV }, 'Gemini health check failed — refusing to start outside production');
  throw err;
}
