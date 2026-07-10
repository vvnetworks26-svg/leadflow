/**
 * tokens.ts — JWT sign / verify utilities.
 *
 * Every token includes:
 *   jti            — unique UUID per token (prevents same-second duplicates)
 *   sid            — sessionId linking the token to a Session document
 *   organizationId — the organization the user is operating in
 */

import jwt, { SignOptions, VerifyOptions } from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { jwtConfig } from '../config/jwt';
import { ApiError } from '../middleware/errorHandler';

export interface TokenPayload {
  sub:            string;          // userId
  email:          string;
  role:           string;
  organizationId: string;          // tenant context
  type:           'access' | 'refresh';
  jti:            string;          // unique token ID
  sid:            string;          // sessionId
}

// ─── Sign ─────────────────────────────────────────────────────────────────────

export function signAccessToken(payload: Omit<TokenPayload, 'type' | 'jti'>): string {
  const opts = { algorithm: jwtConfig.algorithm, expiresIn: jwtConfig.expiresIn } as SignOptions;
  return jwt.sign({ ...payload, type: 'access', jti: randomUUID() }, jwtConfig.secret, opts);
}

export function signRefreshToken(payload: Omit<TokenPayload, 'type' | 'jti'>): string {
  const opts = { algorithm: jwtConfig.algorithm, expiresIn: jwtConfig.refreshExpiresIn } as SignOptions;
  return jwt.sign({ ...payload, type: 'refresh', jti: randomUUID() }, jwtConfig.refreshSecret, opts);
}

// ─── Verify ───────────────────────────────────────────────────────────────────

const VERIFY_OPTS: VerifyOptions = { algorithms: ['HS256'] };

export function verifyAccessToken(token: string): TokenPayload {
  const payload = jwt.verify(token, jwtConfig.secret, VERIFY_OPTS) as TokenPayload;
  if (payload.type !== 'access') {
    throw new ApiError(401, 'Token is invalid or expired', 'INVALID_TOKEN');
  }
  return payload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  const payload = jwt.verify(token, jwtConfig.refreshSecret, VERIFY_OPTS) as TokenPayload;
  if (payload.type !== 'refresh') {
    throw new ApiError(401, 'Token is invalid or expired', 'INVALID_TOKEN');
  }
  return payload;
}
