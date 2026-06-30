/**
 * AuthService.ts
 *
 * All authentication business logic lives here.
 * Controllers call this service — they never touch models directly.
 */

import { UserModel, UserDocument } from '../models/User.model';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/tokens';
import { ApiError } from '../middleware/errorHandler';
import { RegisterDto, LoginDto } from '../dto/auth.dto';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user: ReturnType<UserDocument['toJSON']>;
  tokens: AuthTokens;
}

export const AuthService = {
  /** Register a new user. Throws 409 if email already exists. */
  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await UserModel.findOne({ email: dto.email });
    if (existing) throw new ApiError(409, 'Email already registered', 'EMAIL_TAKEN');

    const user = new UserModel({
      firstName:    dto.firstName,
      lastName:     dto.lastName,
      email:        dto.email,
      passwordHash: dto.password,   // pre-save hook hashes it
      role:         dto.role ?? 'owner',
    });

    await user.save();

    const tokens = issueTokens(user);
    await saveRefreshToken(user, tokens.refreshToken);

    return { user: user.toJSON(), tokens };
  },

  /** Login. Throws 401 on bad credentials. */
  async login(dto: LoginDto): Promise<AuthResult> {
    // Select passwordHash explicitly (it's excluded by default projection)
    const user = await UserModel.findOne({ email: dto.email }).select('+passwordHash +refreshToken');
    if (!user) throw new ApiError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');

    const valid = await user.comparePassword(dto.password);
    if (!valid) throw new ApiError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');

    const tokens = issueTokens(user);
    await saveRefreshToken(user, tokens.refreshToken);

    return { user: user.toJSON(), tokens };
  },

  /** Logout — clears stored refresh token. */
  async logout(userId: string): Promise<void> {
    await UserModel.findByIdAndUpdate(userId, { refreshToken: undefined });
  },

  /** Refresh tokens — validates the refresh token and issues new pair. */
  async refresh(incomingRefreshToken: string): Promise<AuthTokens> {
    let payload;
    try {
      payload = verifyRefreshToken(incomingRefreshToken);
    } catch {
      throw new ApiError(401, 'Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
    }

    const user = await UserModel.findById(payload.sub).select('+refreshToken');
    if (!user || user.refreshToken !== incomingRefreshToken) {
      throw new ApiError(401, 'Refresh token reuse detected', 'TOKEN_REUSE');
    }

    const tokens = issueTokens(user);
    await saveRefreshToken(user, tokens.refreshToken);
    return tokens;
  },

  /** Return the current user document. */
  async me(userId: string): Promise<UserDocument> {
    const user = await UserModel.findById(userId);
    if (!user) throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
    return user;
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function issueTokens(user: UserDocument): AuthTokens {
  const payload = { sub: user.id as string, email: user.email, role: user.role };
  return {
    accessToken:  signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
}

async function saveRefreshToken(user: UserDocument, token: string): Promise<void> {
  user.refreshToken = token;
  await user.save({ validateBeforeSave: false });
}
