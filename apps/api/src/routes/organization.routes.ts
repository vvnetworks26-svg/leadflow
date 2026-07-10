/**
 * organization.routes.ts
 *
 * Organization profile, member management, and invitation endpoints.
 * All routes require authentication and organization context.
 */

import { Router } from 'express';
import {
  getOrganization,
  updateOrganization,
  listMembers,
  updateMemberRole,
  removeMember,
  listInvitations,
  createInvitation,
  acceptInvitation,
  cancelInvitation,
} from '../controllers/organizationController';
import { authenticate, authorize, requireOrganization } from '../middleware/authenticate';
import { OWNER_ONLY, OWNER_ADMIN, MANAGER_AND_ABOVE, ALL_ROLES } from '../config/permissions';

const router = Router();
router.use(authenticate);
router.use(requireOrganization);

// ── Organization profile ───────────────────────────────────────────────────
router.get('/',    authorize(...ALL_ROLES),   getOrganization);
router.patch('/',  authorize(...OWNER_ADMIN), updateOrganization);

// ── Members ────────────────────────────────────────────────────────────────
router.get('/members',               authorize(...MANAGER_AND_ABOVE), listMembers);
router.patch('/members/:userId/role',authorize(...OWNER_ADMIN),       updateMemberRole);
router.delete('/members/:userId',    authorize(...OWNER_ADMIN),       removeMember);

// ── Invitations ────────────────────────────────────────────────────────────
router.get('/invitations',                authorize(...OWNER_ADMIN), listInvitations);
router.post('/invitations',               authorize(...OWNER_ADMIN), createInvitation);
router.delete('/invitations/:invitationId', authorize(...OWNER_ADMIN), cancelInvitation);

export default router;
