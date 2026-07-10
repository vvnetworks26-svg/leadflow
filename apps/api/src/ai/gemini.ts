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

// ─── Safety settings ──────────────────────────────────────────────────────────

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

// ─── Public API ───────────────────────────────────────────────────────────────

export interface GeminiRequest {
  systemPrompt:   string;
  knowledgeBlock: string;   // injected as first user message
  history:        ChatMessage[];
  userMessage:    string;
  modelName?:     string;   // defaults to gemini-1.5-flash
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
      model:          req.modelName ?? 'gemini-1.5-flash',
      safetySettings: SAFETY_SETTINGS,
      generationConfig: {
        maxOutputTokens: req.maxTokens ?? 512,
        temperature:     0.7,
        topP:            0.9,
        topK:            40,
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
