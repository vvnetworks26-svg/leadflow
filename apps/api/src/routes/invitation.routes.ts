/**
 * invitation.routes.ts
 *
 * Public endpoint: accept an invitation by token.
 * Optionally authenticated — works for both new and existing users.
 */

import { Router } from 'express';
import { acceptInvitation } from '../controllers/organizationController';
import { authenticate } from '../middleware/authenticate';

const router = Router();

/**
 * POST /api/v1/invitations/accept
 * Body: { token: string }
 * Auth: optional — if a Bearer token is provided it links to that user,
 *       otherwise looks up the user account by the invitation email.
 */
router.post('/accept', (req, res, next) => {
  // Try to authenticate silently — if no token, continue unauthenticated
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authenticate(req, res, next);
  }
  next();
}, acceptInvitation);

export default router;
