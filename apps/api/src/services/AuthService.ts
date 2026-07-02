/**
 * AuthService.ts
 *
 * Authentication business logic.
 * Session lifecycle → SessionService.
 * Audit trail → AuditService (fire-and-forget, never blocks auth flow).
 * Controllers never touch models directly.
 */

import { Request } from 'express';
import { UserModel, UserDocument } from '../models/User.model';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/tokens';
import { ApiError } from '../middleware/errorHandler';
import { SessionService } from './SessionService';
import { AuditService } from './AuditService';
import { RegisterDto, LoginDto } from '../dto/auth.dto';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user: ReturnType<UserDocument['toJSON']>;
  tokens: AuthTokens;
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function getClientMeta(req?: Partial<Request>) {
  return {
    userAgent: (req?.headers?.['user-agent'] as string | undefined) ?? '',
    ipAddress: (req?.ip ?? (req?.socket as any)?.remoteAddress ?? ''),
  };
}

function issueTokens(user: UserDocument, sessionId: string): AuthTokens {
  const base = { sub: user.id as string, email: user.email, role: user.role, sid: sessionId };
  return {
    accessToken:  signAccessToken(base),
    refreshToken: signRefreshToken(base),
  };
}

// ─── Public service ───────────────────────────────────────────────────────────

export const AuthService = {
  /** Register a new user and create an initial session. */
  async register(dto: RegisterDto, req?: Partial<Request>): Promise<AuthResult> {
    const existing = await UserModel.findOne({ email: dto.email });
    if (existing) throw new ApiError(409, 'Email already registered', 'EMAIL_TAKEN');

    const user = new UserModel({
      firstName:    dto.firstName,
      lastName:     dto.lastName,
      email:        dto.email,
      passwordHash: dto.password,
      role:         'owner',
    });
    await user.save();

    const meta = getClientMeta(req);

    const placeholderRt = 'placeholder-' + user.id;
    const sessionId = await SessionService.create({
      userId:          user.id as string,
      rawRefreshToken: placeholderRt,
      ...meta,
    });

    const tokens = issueTokens(user, sessionId);
    await SessionService.rotate(sessionId, tokens.refreshToken);

    // ── Audit ──────────────────────────────────────────────────────────────
    AuditService.logRegister({
      userId:    user.id as string,
      sessionId,
      ...meta,
      metadata:  { email: user.email, role: user.role },
    });

    return { user: user.toJSON(), tokens };
  },

  /** Login, verify credentials, and create a new session. */
  async login(dto: LoginDto, req?: Partial<Request>): Promise<AuthResult> {
    const meta = getClientMeta(req);
    const user = await UserModel.findOne({ email: dto.email }).select('+passwordHash');

    if (!user) {
      // ── Audit: failed login (unknown email) ────────────────────────────
      AuditService.logFailedLogin({
        ...meta,
        metadata: { reason: 'User not found', email: dto.email },
      });
      throw new ApiError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }

    const valid = await user.comparePassword(dto.password);
    if (!valid) {
      // ── Audit: failed login (wrong password) ───────────────────────────
      AuditService.logFailedLogin({
        userId: user.id as string,
        ...meta,
        metadata: { reason: 'Invalid password' },
      });
      throw new ApiError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }

    const placeholderRt = 'placeholder-' + user.id + '-' + Date.now();
    const sessionId = await SessionService.create({
      userId:          user.id as string,
      rawRefreshToken: placeholderRt,
      ...meta,
    });

    const tokens = issueTokens(user, sessionId);
    await SessionService.rotate(sessionId, tokens.refreshToken);

    // ── Audit: successful login ────────────────────────────────────────
    AuditService.logLogin({
      userId:    user.id as string,
      sessionId,
      ...meta,
      metadata:  { email: user.email },
    });

    return { user: user.toJSON(), tokens };
  },

  /**
   * Logout — revoke only the current session.
   * Works even when the access token has expired.
   * Silent on invalid/expired tokens.
   */
  async logout(incomingRefreshToken: string, req?: Partial<Request>): Promise<void> {
    const meta = getClientMeta(req);
    let payload;
    try {
      payload = verifyRefreshToken(incomingRefreshToken);
    } catch {
      return;
    }

    try {
      await SessionService.verify(payload.sid, incomingRefreshToken);
    } catch {
      return;
    }

    await SessionService.revoke(payload.sid);

    // ── Audit ──────────────────────────────────────────────────────────────
    AuditService.logLogout({
      userId:    payload.sub,
      sessionId: payload.sid,
      ...meta,
    });
  },

  /**
   * Refresh tokens.
   * Detects reuse via SessionService.verify (which auto-revokes on breach).
   */
  async refresh(incomingRefreshToken: string, req?: Partial<Request>): Promise<AuthTokens> {
    const meta = getClientMeta(req);

    let payload;
    try {
      payload = verifyRefreshToken(incomingRefreshToken);
    } catch {
      throw new ApiError(401, 'Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
    }

    try {
      await SessionService.verify(payload.sid, incomingRefreshToken);
    } catch (err: any) {
      // Token reuse detected by SessionService — emit security audit
      if (err?.code === 'TOKEN_REUSE') {
        AuditService.logTokenReuse({
          userId:    payload.sub,
          sessionId: payload.sid,
          ...meta,
          metadata:  { reason: 'Hash mismatch — session auto-revoked' },
        });
        // Also log the session revocation
        AuditService.logSessionRevoked({
          userId:    payload.sub,
          sessionId: payload.sid,
          ...meta,
          metadata:  { trigger: 'TOKEN_REUSE' },
        });
      }
      throw err;
    }

    const user = await UserModel.findById(payload.sub);
    if (!user) throw new ApiError(401, 'User not found', 'USER_NOT_FOUND');

    const tokens = issueTokens(user, payload.sid);
    await SessionService.rotate(payload.sid, tokens.refreshToken);

    // ── Audit ──────────────────────────────────────────────────────────────
    AuditService.logRefresh({
      userId:    payload.sub,
      sessionId: payload.sid,
      ...meta,
      metadata:  { refreshRotation: true },
    });

    return tokens;
  },

  /** Return the current user document. */
  async me(userId: string): Promise<UserDocument> {
    const user = await UserModel.findById(userId);
    if (!user) throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
    return user;
  },
};
