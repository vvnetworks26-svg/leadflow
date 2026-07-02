/**
 * SessionService.ts
 *
 * All session lifecycle logic in one place.
 * AuthService calls this — controllers never touch SessionModel directly.
 *
 * Each authenticated session maps to one Session document.
 * The refresh token is bound to its session via the `sid` JWT claim.
 */

import { randomUUID } from 'crypto';
import { SessionModel, SessionDocument, hashToken } from '../models/Session.model';
import { ApiError } from '../middleware/errorHandler';

// Refresh token TTL in milliseconds — must match JWT_REFRESH_EXPIRES_IN (7 days)
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface CreateSessionOptions {
  userId:    string;
  rawRefreshToken: string;
  userAgent: string;
  ipAddress: string;
}

export const SessionService = {
  /**
   * Create a new session for a user.
   * Returns the generated sessionId to be embedded in the JWT `sid` claim.
   */
  async create(opts: CreateSessionOptions): Promise<string> {
    const sessionId = randomUUID();
    const now       = new Date();

    await SessionModel.create({
      userId:             opts.userId,
      sessionId,
      hashedRefreshToken: hashToken(opts.rawRefreshToken),
      userAgent:          opts.userAgent,
      ipAddress:          opts.ipAddress,
      lastUsedAt:         now,
      expiresAt:          new Date(now.getTime() + REFRESH_TTL_MS),
      revokedAt:          null,
    });

    return sessionId;
  },

  /**
   * Verify an incoming refresh token against its session.
   * Returns the session document on success.
   * Throws 401 for any invalid, revoked, or expired state.
   */
  async verify(sessionId: string, rawRefreshToken: string): Promise<SessionDocument> {
    const session = await SessionModel.findOne({ sessionId }).select('+hashedRefreshToken');

    if (!session) {
      throw new ApiError(401, 'Session not found', 'SESSION_NOT_FOUND');
    }
    if (session.revokedAt) {
      throw new ApiError(401, 'Session has been revoked', 'SESSION_REVOKED');
    }
    if (session.expiresAt <= new Date()) {
      throw new ApiError(401, 'Session has expired', 'SESSION_EXPIRED');
    }
    if (hashToken(rawRefreshToken) !== session.hashedRefreshToken) {
      // Possible token reuse — revoke the session immediately (rotation breach)
      await SessionModel.findByIdAndUpdate(session._id, { revokedAt: new Date() });
      throw new ApiError(401, 'Refresh token reuse detected', 'TOKEN_REUSE');
    }

    return session;
  },

  /**
   * Rotate the refresh token stored in a session.
   * Called after a successful refresh — invalidates the old token hash.
   */
  async rotate(sessionId: string, newRawRefreshToken: string): Promise<void> {
    await SessionModel.findOneAndUpdate(
      { sessionId },
      {
        hashedRefreshToken: hashToken(newRawRefreshToken),
        lastUsedAt: new Date(),
      }
    );
  },

  /**
   * Revoke a single session.
   * Called by logout — only the current session is affected.
   */
  async revoke(sessionId: string): Promise<void> {
    await SessionModel.findOneAndUpdate(
      { sessionId },
      { revokedAt: new Date() }
    );
  },
};
