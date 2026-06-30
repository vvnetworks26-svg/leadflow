/**
 * tokens.ts — JWT sign / verify utilities.
 * All token logic is in one place so rotating algorithms or adding
 * token introspection later requires changes in a single file.
 */

import jwt, { SignOptions } from 'jsonwebtoken';
import { jwtConfig } from '../config/jwt';

export interface TokenPayload {
  sub: string;
  email: string;
  role: string;
  type: 'access' | 'refresh';
}

export function signAccessToken(payload: Omit<TokenPayload, 'type'>): string {
  const opts = { algorithm: jwtConfig.algorithm, expiresIn: jwtConfig.expiresIn } as SignOptions;
  return jwt.sign({ ...payload, type: 'access' }, jwtConfig.secret, opts);
}

export function signRefreshToken(payload: Omit<TokenPayload, 'type'>): string {
  const opts = { algorithm: jwtConfig.algorithm, expiresIn: jwtConfig.refreshExpiresIn } as SignOptions;
  return jwt.sign({ ...payload, type: 'refresh' }, jwtConfig.refreshSecret, opts);
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, jwtConfig.secret) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, jwtConfig.refreshSecret) as TokenPayload;
}
