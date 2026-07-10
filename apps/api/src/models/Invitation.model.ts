/**
 * Invitation.model.ts
 *
 * Owner/Admin invites a user by email to join an organization.
 * Tokens are one-time-use and expire after 7 days.
 */

import { Schema, model, Document } from 'mongoose';
import { MemberRole } from './Organization.model';

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'cancelled';

export interface IInvitation {
  id:             string;
  organizationId: string;
  email:          string;          // invited email address
  role:           MemberRole;
  token:          string;          // secure random token (hashed in DB)
  invitedBy:      string;          // userId of the inviter
  status:         InvitationStatus;
  expiresAt:      Date;
  acceptedAt:     Date | null;
  createdAt:      Date;
  updatedAt:      Date;
}

export interface InvitationDocument extends Omit<IInvitation, 'id'>, Document {}

const InvitationSchema = new Schema<InvitationDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    email:          { type: String, required: true, lowercase: true, trim: true },
    role:           { type: String, enum: ['owner','admin','manager','agent','viewer'], default: 'agent' },
    token:          { type: String, required: true, unique: true },
    invitedBy:      { type: String, required: true },
    status:         { type: String, enum: ['pending','accepted','expired','cancelled'], default: 'pending' },
    expiresAt:      { type: Date, required: true },
    acceptedAt:     { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        delete (ret as any)._id;
        // Never expose the raw token in API responses
        delete (ret as any).token;
        return ret;
      },
    },
  }
);

// Compound indexes
InvitationSchema.index({ organizationId: 1, status: 1 });
InvitationSchema.index({ organizationId: 1, email:  1 });
// TTL: auto-delete accepted/expired invitations 30 days after expiry
InvitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export const InvitationModel = model<InvitationDocument>('Invitation', InvitationSchema);
