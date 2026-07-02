import { Schema, model, Document } from 'mongoose';
import { createHash } from 'crypto';

export interface ISession {
  userId:            string;
  sessionId:         string;          // UUID, embedded in the refresh token sid claim
  hashedRefreshToken: string;         // SHA-256 hex of the raw refresh token
  userAgent:         string;
  ipAddress:         string;
  createdAt:         Date;
  lastUsedAt:        Date;
  expiresAt:         Date;
  revokedAt:         Date | null;
}

export interface SessionDocument extends Omit<ISession, 'userId'>, Document {
  userId: string;
  /** True when the session is revoked or past its expiry. */
  readonly isActive: boolean;
}

const SessionSchema = new Schema<SessionDocument>(
  {
    userId:             { type: String, required: true, index: true },
    sessionId:          { type: String, required: true, unique: true, index: true },
    hashedRefreshToken: { type: String, required: true, select: false },
    userAgent:          { type: String, default: '' },
    ipAddress:          { type: String, default: '' },
    expiresAt:          { type: Date,   required: true },
    lastUsedAt:         { type: Date,   default: Date.now },
    revokedAt:          { type: Date,   default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        delete (ret as any)._id;
        delete (ret as any).hashedRefreshToken;
        return ret;
      },
    },
  }
);

SessionSchema.virtual('isActive').get(function (this: SessionDocument): boolean {
  return !this.revokedAt && this.expiresAt > new Date();
});

// TTL index: MongoDB auto-deletes expired sessions 24 h after expiry
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });

export const SessionModel = model<SessionDocument>('Session', SessionSchema);

/** SHA-256 hex hash of a raw refresh token. */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
