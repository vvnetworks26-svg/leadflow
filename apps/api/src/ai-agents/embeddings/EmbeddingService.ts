/**
 * EmbeddingService.ts
 *
 * Provider abstraction for text embeddings.
 * Supports: Gemini, OpenAI, Local (deterministic mock for dev/test).
 * Results are cached in-memory per session to avoid redundant API calls.
 */

import { env } from '../../config/env';
import { logger } from '../../utils/logger';

export interface IEmbeddingProvider {
  readonly name: string;
  embed(texts: string[]): Promise<number[][]>;
  embedOne(text: string): Promise<number[]>;
}

// ─── Gemini embedding ─────────────────────────────────────────────────────────

class GeminiEmbeddingProvider implements IEmbeddingProvider {
  readonly name = 'gemini';

  async embed(texts: string[]): Promise<number[][]> {
    try {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genai = new GoogleGenerativeAI(env.GEMINI_API_KEY);
      const m     = genai.getGenerativeModel({ model: 'embedding-001' });
      const results: number[][] = [];
      for (const text of texts) {
        const r = await m.embedContent(text);
        results.push(r.embedding.values);
      }
      return results;
    } catch (err) {
      logger.warn({ err }, '[Embedding] Gemini failed, using local mock');
      return LocalEmbeddingProvider.instance.embed(texts);
    }
  }

  async embedOne(text: string): Promise<number[]> {
    const r = await this.embed([text]);
    return r[0] ?? [];
  }
}

// ─── Local deterministic mock (dev/test) ──────────────────────────────────────

class LocalEmbeddingProvider implements IEmbeddingProvider {
  readonly name = 'local';
  static readonly instance = new LocalEmbeddingProvider();
  private readonly DIM = 64;

  embed(texts: string[]): Promise<number[][]> {
    return Promise.resolve(texts.map(t => this._hash(t)));
  }

  async embedOne(text: string): Promise<number[]> {
    return this._hash(text);
  }

  private _hash(text: string): number[] {
    const vec = new Array(this.DIM).fill(0);
    for (let i = 0; i < text.length; i++) {
      vec[i % this.DIM] += text.charCodeAt(i) / 255;
    }
    // Normalize to unit vector
    const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map(v => v / mag);
  }
}

// ─── OpenAI embedding ─────────────────────────────────────────────────────────

class OpenAIEmbeddingProvider implements IEmbeddingProvider {
  readonly name = 'openai';

  constructor(private apiKey: string) {}

  async embed(texts: string[]): Promise<number[][]> {
    try {
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ model: 'text-embedding-3-small', input: texts }),
      });
      const json = await res.json() as any;
      return (json.data as any[]).map((d: any) => d.embedding);
    } catch (err) {
      logger.warn({ err }, '[Embedding] OpenAI failed, using local mock');
      return LocalEmbeddingProvider.instance.embed(texts);
    }
  }

  async embedOne(text: string): Promise<number[]> {
    return (await this.embed([text]))[0] ?? [];
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

// In-memory embedding cache (key = provider:text, value = vector)
const embeddingCache = new Map<string, number[]>();
const CACHE_MAX = 2000;

export function getEmbeddingProvider(provider = 'auto'): IEmbeddingProvider {
  if (provider === 'openai' && env.OPENAI_API_KEY) {
    return new OpenAIEmbeddingProvider(env.OPENAI_API_KEY);
  }
  if (env.GEMINI_API_KEY && (provider === 'gemini' || provider === 'auto')) {
    return new GeminiEmbeddingProvider();
  }
  return LocalEmbeddingProvider.instance;
}

export async function embedWithCache(text: string, provider = 'auto'): Promise<number[]> {
  const key = `${provider}:${text.slice(0, 200)}`;
  if (embeddingCache.has(key)) return embeddingCache.get(key)!;

  const vec = await getEmbeddingProvider(provider).embedOne(text);
  if (embeddingCache.size >= CACHE_MAX) {
    const first = embeddingCache.keys().next().value;
    if (first) embeddingCache.delete(first);
  }
  embeddingCache.set(key, vec);
  return vec;
}

/** Cosine similarity between two vectors. Returns -1 to 1. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}
