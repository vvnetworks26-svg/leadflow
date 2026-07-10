/**
 * AuthService.ts
 *
 * Authentication business logic.
 * On register: creates User + Organization + OrganizationMember (owner).
 * JWT access and refresh tokens now include organizationId for tenant context.
 *
 * Session lifecycle → SessionService.
 * Audit trail → AuditService (fire-and-forget, never blocks auth flow).
 */

import { Request } from 'express';
import { UserModel, UserDocument } from '../models/User.model';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/tokens';
import { ApiError } from '../middleware/errorHandler';
import { SessionService } from './SessionService';
import { AuditService } from './AuditService';
import { OrganizationService } from './OrganizationService';
import { RegisterDto, LoginDto } from '../dto/auth.dto';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user:           ReturnType<UserDocument['toJSON']>;
  tokens:         AuthTokens;
  organizationId: string;
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function getClientMeta(req?: Partial<Request>) {
  return {
    userAgent: (req?.headers?.['user-agent'] as string | undefined) ?? '',
    ipAddress: (req?.ip ?? (req?.socket as any)?.remoteAddress ?? ''),
  };
}

function issueTokens(user: UserDocument, sessionId: string, organizationId: string): AuthTokens {
  const base = {
    sub:            user.id as string,
    email:          user.email,
    role:           user.role,
    organizationId,
    sid:            sessionId,
  };
  return {
    accessToken:  signAccessToken(base),
    refreshToken: signRefreshToken(base),
  };
}

// ─── Public service ───────────────────────────────────────────────────────────

export const AuthService = {
  /**
   * Register a new user.
   * Creates: User → Organization (named after user) → OrganizationMember (owner).
   * Seeds default business config via OrganizationService.create().
   */
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

    // Create the organization (this also seeds default data)
    const orgName = dto.organizationName ?? `${dto.firstName} ${dto.lastName}'s Organization`;
    const org     = await OrganizationService.create(orgName);
    const orgId   = org.id as string;

    // Assign the user as owner of the new organization
    await OrganizationService.addMember(orgId, user.id as string, 'owner');

    const meta = getClientMeta(req);

    const placeholderRt = 'placeholder-' + user.id;
    const sessionId = await SessionService.create({
      userId:          user.id as string,
      rawRefreshToken: placeholderRt,
      ...meta,
    });

    const tokens = issueTokens(user, sessionId, orgId);
    await SessionService.rotate(sessionId, tokens.refreshToken);

    // ── Audit ──────────────────────────────────────────────────────────────
    AuditService.logRegister({
      userId:         user.id as string,
      organizationId: orgId,
      sessionId,
      ...meta,
      metadata: { email: user.email, role: user.role },
    });

    // Fire workflow engine for user_registered trigger (fire-and-forget)
    try {
      const { WorkflowEngine } = require('../automation/engine/WorkflowEngine');
      WorkflowEngine.trigger('user_registered', orgId, {
        userId:    user.id,
        email:     user.email,
        firstName: dto.firstName,
        lastName:  dto.lastName,
      });
    } catch { /* non-blocking */ }

    return { user: user.toJSON(), tokens, organizationId: orgId };
  },

  /**
   * Login, verify credentials, and create a new session.
   * Resolves the user's organization from their membership record.
   */
  async login(dto: LoginDto, req?: Partial<Request>): Promise<AuthResult> {
    const meta = getClientMeta(req);
    const user = await UserModel.findOne({ email: dto.email }).select('+passwordHash');

    if (!user) {
      AuditService.logFailedLogin({
        ...meta,
        metadata: { reason: 'User not found', email: dto.email },
      });
      throw new ApiError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }

    const valid = await user.comparePassword(dto.password);
    if (!valid) {
      AuditService.logFailedLogin({
        userId: user.id as string,
        ...meta,
        metadata: { reason: 'Invalid password' },
      });
      throw new ApiError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }

    // Resolve organization from membership
    const orgId = await OrganizationService.findOrganizationForUser(user.id as string);
    if (!orgId) {
      throw new ApiError(403, 'User is not a member of any organization', 'NO_ORGANIZATION');
    }

    const placeholderRt = 'placeholder-' + user.id + '-' + Date.now();
    const sessionId = await SessionService.create({
      userId:          user.id as string,
      rawRefreshToken: placeholderRt,
      ...meta,
    });

    const tokens = issueTokens(user, sessionId, orgId);
    await SessionService.rotate(sessionId, tokens.refreshToken);

    AuditService.logLogin({
      userId:         user.id as string,
      organizationId: orgId,
      sessionId,
      ...meta,
      metadata: { email: user.email },
    });

    return { user: user.toJSON(), tokens, organizationId: orgId };
  },

  /**
   * Logout — revoke only the current session.
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

    AuditService.logLogout({
      userId:         payload.sub,
      organizationId: payload.organizationId,
      sessionId:      payload.sid,
      ...meta,
    });
  },

  /**
   * Refresh tokens.
   * Detects reuse via SessionService.verify (auto-revokes on breach).
   * Preserves the organizationId from the original refresh token.
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
      if (err?.code === 'TOKEN_REUSE') {
        AuditService.logTokenReuse({
          userId:         payload.sub,
          organizationId: payload.organizationId,
          sessionId:      payload.sid,
          ...meta,
          metadata: { reason: 'Hash mismatch — session auto-revoked' },
        });
        AuditService.logSessionRevoked({
          userId:         payload.sub,
          organizationId: payload.organizationId,
          sessionId:      payload.sid,
          ...meta,
          metadata: { trigger: 'TOKEN_REUSE' },
        });
      }
      throw err;
    }

    const user = await UserModel.findById(payload.sub);
    if (!user) throw new ApiError(401, 'User not found', 'USER_NOT_FOUND');

    const tokens = issueTokens(user, payload.sid, payload.organizationId);
    await SessionService.rotate(payload.sid, tokens.refreshToken);

    AuditService.logRefresh({
      userId:         payload.sub,
      organizationId: payload.organizationId,
      sessionId:      payload.sid,
      ...meta,
      metadata: { refreshRotation: true },
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
