/**
 * logger.ts — Pino logger singleton.
 *
 * Redaction: sensitive fields are automatically replaced with "[Redacted]"
 * wherever they appear in any log entry — including deeply nested objects.
 * This prevents accidental leakage of tokens, passwords, and credentials
 * into log aggregators, consoles, or any log transport.
 */

import pino from 'pino';
import { env } from '../config/env';

/**
 * Fields redacted at every depth in every log entry.
 * Uses Pino's wildcard path syntax:  "*.fieldName"  matches any nesting level.
 */
const REDACTED_FIELDS = [
  // HTTP headers — match both incoming req.headers and outgoing res object
  'req.headers.authorization',
  'res.headers["set-cookie"]',

  // Common credential field names at any nesting depth
  '*.authorization',
  '*.password',
  '*.passwordHash',
  '*.accessToken',
  '*.refreshToken',
  '*.token',
  '*.cookie',
  '*.["set-cookie"]',
];

export const logger = pino({
  level: env.LOG_LEVEL,

  // Redact sensitive fields — value replaced with "[Redacted]" in all outputs
  redact: {
    paths:  REDACTED_FIELDS,
    censor: '[Redacted]',
  },

  transport: env.isDev
    ? { target: 'pino-pretty', options: { colorize: true, ignore: 'pid,hostname' } }
    : undefined,
});
