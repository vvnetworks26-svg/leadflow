/**
 * env.ts
 *
 * Loads and validates environment variables once at startup.
 * All other config modules import from here — no raw process.env
 * access anywhere else in the codebase.
 *
 * Throws a descriptive error at boot time if a required variable
 * is missing, so the problem surfaces immediately rather than at
 * the first runtime call that needs the value.
 */

import dotenv from 'dotenv';
import path from 'path';

// Load .env relative to the api package root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function require(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

function optional(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

export const env = {
  NODE_ENV:     optional('NODE_ENV', 'development'),
  PORT:         parseInt(optional('PORT', '4000'), 10),
  API_VERSION:  optional('API_VERSION', '1.0.0'),

  // Database — not connected yet (Sprint 5.2)
  MONGODB_URI:  optional('MONGODB_URI', ''),

  // Auth
  JWT_SECRET:          optional('JWT_SECRET', 'dev-secret-change-in-production'),
  JWT_EXPIRES_IN:      optional('JWT_EXPIRES_IN', '15m'),
  JWT_REFRESH_SECRET:  optional('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-in-production'),
  JWT_REFRESH_EXPIRES_IN: optional('JWT_REFRESH_EXPIRES_IN', '7d'),

  // CORS
  CORS_ORIGINS: optional('CORS_ORIGINS', 'http://localhost:3000'),

  // Logging
  LOG_LEVEL: optional('LOG_LEVEL', 'info'),

  // Helpers
  get isDev():  boolean { return this.NODE_ENV === 'development'; },
  get isProd(): boolean { return this.NODE_ENV === 'production'; },
  get isTest(): boolean { return this.NODE_ENV === 'test'; }
} as const;
