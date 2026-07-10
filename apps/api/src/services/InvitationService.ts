/**
 * InvitationService.ts
 *
 * Owner/Admin invites users to join an organization by email.
 * Invitation tokens are cryptographically random and expire after 7 days.
 * Accepting an invitation creates/links the user to the organization.
 */

import { randomBytes } from 'crypto';
import { InvitationModel } from '../models/Invitation.model';
import { UserModel } from '../models/User.model';
import { OrganizationService } from './OrganizationService';
import { ApiError } from '../middleware/errorHandler';
import type { MemberRole } from '../models/Organization.model';

const INVITE_TTL_DAYS = 7;
const INVITE_TTL_MS   = INVITE_TTL_DAYS * 24 * 60 * 60 * 1000;

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

export const InvitationService = {
  /**
   * Create an invitation for an email address to join an organization.
   * Cancels any previous pending invitation for the same email in this org.
   */
  async create(
    organizationId: string,
    invitedBy:      string,
    email:          string,
    role:           MemberRole = 'agent'
  ) {
    const normalizedEmail = email.toLowerCase().trim();

    // Cancel any existing pending invitation for this org+email
    await InvitationModel.updateMany(
      { organizationId, email: normalizedEmail, status: 'pending' },
      { $set: { status: 'cancelled' } }
    );

    const token     = generateToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    const invitation = await InvitationModel.create({
      organizationId,
      email: normalizedEmail,
      role,
      token,
      invitedBy,
      status:     'pending',
      expiresAt,
      acceptedAt: null,
    });

    // Return the doc but also include the raw token in this one-time response
    const result = invitation.toJSON() as any;
    result.token = token; // expose only on creation, before toJSON strips it
    return result;
  },

  /**
   * Accept an invitation using a raw token.
   * Finds or creates the user, then adds them as an org member.
   */
  async accept(token: string, acceptingUserId?: string): Promise<{ organizationId: string; role: MemberRole }> {
    const now        = new Date();
    const invitation = await InvitationModel.findOne({ token, status: 'pending' });

    if (!invitation) {
      throw new ApiError(404, 'Invitation not found or already used', 'INVITATION_NOT_FOUND');
    }
    if (invitation.expiresAt < now) {
      await InvitationModel.findByIdAndUpdate(invitation._id, { status: 'expired' });
      throw new ApiError(410, 'Invitation has expired', 'INVITATION_EXPIRED');
    }

    // If an authenticated userId is provided, use it; otherwise look up by email
    let userId = acceptingUserId;
    if (!userId) {
      const user = await UserModel.findOne({ email: invitation.email });
      if (!user) {
        throw new ApiError(400, 'No account found for this email. Please register first.', 'USER_NOT_FOUND');
      }
      userId = user.id as string;
    }

    // Add/update org membership
    await OrganizationService.addMember(invitation.organizationId, userId, invitation.role);

    // Mark invitation as accepted
    await InvitationModel.findByIdAndUpdate(invitation._id, {
      status:     'accepted',
      acceptedAt: now,
    });

    return { organizationId: invitation.organizationId, role: invitation.role };
  },

  /**
   * List all invitations for an organization (all states unless filtered).
   */
  async listByOrganization(organizationId: string, status?: string) {
    const filter: Record<string, unknown> = { organizationId };
    if (status) filter.status = status;
    const docs = await InvitationModel.find(filter).sort({ createdAt: -1 });
    return docs.map(d => d.toJSON());
  },

  /**
   * Cancel a pending invitation.
   */
  async cancel(organizationId: string, invitationId: string): Promise<void> {
    const doc = await InvitationModel.findOneAndUpdate(
      { _id: invitationId, organizationId, status: 'pending' },
      { $set: { status: 'cancelled' } }
    );
    if (!doc) throw new ApiError(404, 'Invitation not found', 'INVITATION_NOT_FOUND');
  },

  /**
   * Expire all overdue pending invitations (run via scheduled job or on demand).
   */
  async expireStale(): Promise<number> {
    const result = await InvitationModel.updateMany(
      { status: 'pending', expiresAt: { $lt: new Date() } },
      { $set: { status: 'expired' } }
    );
    return result.modifiedCount;
  },
};
