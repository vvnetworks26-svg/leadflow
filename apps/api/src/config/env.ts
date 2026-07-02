/**
 * env.ts
 *
 * Loads and validates environment variables once at startup.
 * All other config modules import from here — no raw process.env
 * access anywhere else in the codebase.
 *
 * Throws a descriptive startup error if:
 *   - NODE_ENV is not one of: development | test | production
 *   - A required production variable (MONGODB_URI, JWT_SECRET,
 *     JWT_REFRESH_SECRET) is absent when NODE_ENV === 'production'
 */

import dotenv from 'dotenv';
import path from 'path';

// Load .env relative to the api package root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function optional(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

/**
 * Require a variable unconditionally.
 * Throws a startup error if the value is absent or empty.
 */
function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`[env] Missing required environment variable: ${key}`);
  return val;
}

/**
 * Require a variable only in production.
 * Falls back to `devDefault` in development/test so local startup works
 * without a full .env file.
 */
function requireInProd(key: string, devDefault: string): string {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  if (nodeEnv === 'production') return requireEnv(key);
  return optional(key, devDefault);
}

// ─── NODE_ENV validation ──────────────────────────────────────────────────────

const ALLOWED_NODE_ENVS = ['development', 'test', 'production'] as const;
type NodeEnv = typeof ALLOWED_NODE_ENVS[number];

const rawNodeEnv = process.env.NODE_ENV ?? 'development';
if (!(ALLOWED_NODE_ENVS as readonly string[]).includes(rawNodeEnv)) {
  throw new Error(
    `[env] Invalid NODE_ENV "${rawNodeEnv}". ` +
    `Allowed values: ${ALLOWED_NODE_ENVS.join(', ')}`
  );
}
const NODE_ENV = rawNodeEnv as NodeEnv;

// ─── Environment object ───────────────────────────────────────────────────────

export const env = {
  NODE_ENV,
  PORT:        parseInt(optional('PORT', '4000'), 10),
  API_VERSION: optional('API_VERSION', '1.0.0'),

  // Required in production; safe defaults in development/test
  MONGODB_URI:            requireInProd('MONGODB_URI',           ''),
  JWT_SECRET:             requireInProd('JWT_SECRET',            'dev-secret-change-in-production'),
  JWT_REFRESH_SECRET:     requireInProd('JWT_REFRESH_SECRET',    'dev-refresh-secret-change-in-production'),

  // Optional with sensible defaults
  JWT_EXPIRES_IN:         optional('JWT_EXPIRES_IN',         '15m'),
  JWT_REFRESH_EXPIRES_IN: optional('JWT_REFRESH_EXPIRES_IN', '7d'),
  CORS_ORIGINS:           optional('CORS_ORIGINS',           'http://localhost:3000'),
  LOG_LEVEL:              optional('LOG_LEVEL',              'info'),

  // Helpers
  get isDev():  boolean { return this.NODE_ENV === 'development'; },
  get isProd(): boolean { return this.NODE_ENV === 'production'; },
  get isTest(): boolean { return this.NODE_ENV === 'test'; },
} as const;
