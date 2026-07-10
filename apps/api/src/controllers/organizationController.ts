/**
 * organizationController.ts
 *
 * Handles organization profile, member management, and invitation endpoints.
 * All operations are automatically scoped to req.organizationId.
 */

import { Request, Response, NextFunction } from 'express';
import { OrganizationService } from '../services/OrganizationService';
import { InvitationService } from '../services/InvitationService';
import { ApiError } from '../middleware/errorHandler';
import { param } from '../utils/params';
import type { MemberRole } from '../models/Organization.model';

// ─── Organization profile ─────────────────────────────────────────────────────

export async function getOrganization(req: Request, res: Response, next: NextFunction) {
  try {
    const org = await OrganizationService.getById(req.organizationId!);
    res.json({ status: 'ok', data: org });
  } catch (e) { next(e); }
}

export async function updateOrganization(req: Request, res: Response, next: NextFunction) {
  try {
    const org = await OrganizationService.update(req.organizationId!, req.body);
    res.json({ status: 'ok', data: org });
  } catch (e) { next(e); }
}

// ─── Members ──────────────────────────────────────────────────────────────────

export async function listMembers(req: Request, res: Response, next: NextFunction) {
  try {
    const members = await OrganizationService.listMembers(req.organizationId!);
    res.json({ status: 'ok', data: members });
  } catch (e) { next(e); }
}

export async function updateMemberRole(req: Request, res: Response, next: NextFunction) {
  try {
    const { role } = req.body as { role: MemberRole };
    if (!role) throw new ApiError(422, 'role is required', 'VALIDATION_ERROR');

    const userId = param(req.params.userId);
    // Prevent an owner from demoting themselves
    if (userId === req.user!.sub && role !== 'owner') {
      throw new ApiError(400, 'Owners cannot change their own role', 'SELF_ROLE_CHANGE');
    }

    const member = await OrganizationService.updateMemberRole(req.organizationId!, userId, role);
    res.json({ status: 'ok', data: member });
  } catch (e) { next(e); }
}

export async function removeMember(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = param(req.params.userId);
    if (userId === req.user!.sub) {
      throw new ApiError(400, 'Cannot remove yourself from the organization', 'SELF_REMOVE');
    }
    await OrganizationService.removeMember(req.organizationId!, userId);
    res.status(204).send();
  } catch (e) { next(e); }
}

// ─── Invitations ──────────────────────────────────────────────────────────────

export async function listInvitations(req: Request, res: Response, next: NextFunction) {
  try {
    const status      = req.query.status as string | undefined;
    const invitations = await InvitationService.listByOrganization(req.organizationId!, status);
    res.json({ status: 'ok', data: invitations });
  } catch (e) { next(e); }
}

export async function createInvitation(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, role } = req.body as { email: string; role?: MemberRole };
    if (!email) throw new ApiError(422, 'email is required', 'VALIDATION_ERROR');

    const invitation = await InvitationService.create(
      req.organizationId!,
      req.user!.sub,
      email,
      role ?? 'agent'
    );
    res.status(201).json({ status: 'ok', data: invitation });
  } catch (e) { next(e); }
}

export async function acceptInvitation(req: Request, res: Response, next: NextFunction) {
  try {
    const { token } = req.body as { token: string };
    if (!token) throw new ApiError(422, 'token is required', 'VALIDATION_ERROR');

    const result = await InvitationService.accept(token, req.user?.sub);
    res.json({ status: 'ok', data: result });
  } catch (e) { next(e); }
}

export async function cancelInvitation(req: Request, res: Response, next: NextFunction) {
  try {
    await InvitationService.cancel(req.organizationId!, param(req.params.invitationId));
    res.status(204).send();
  } catch (e) { next(e); }
}
