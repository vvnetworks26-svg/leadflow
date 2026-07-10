/**
 * ai.routes.ts
 *
 * AI conversation engine endpoints.
 * All routes require authentication + organization context.
 * POST /ai/chat is also available via the widget (unauthenticated) using
 * the widget token in the URL.
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  chat,
  detectIntent,
  qualify,
  getRecommendations,
  summarize,
  analytics,
  getSession,
} from '../controllers/aiController';
import { authenticate, requireOrganization, authorize } from '../middleware/authenticate';
import { ALL_ROLES, MANAGER_AND_ABOVE } from '../config/permissions';

const router = Router();

// AI chat has a dedicated rate limiter — 120 req / 15 min per IP
const aiLimiter = rateLimit({
  windowMs:       15 * 60 * 1000,
  max:            120,
  standardHeaders: true,
  legacyHeaders:  false,
  message: { status: 'error', code: 'RATE_LIMITED', message: 'Too many AI requests. Please slow down.' },
});

router.use(authenticate);
router.use(requireOrganization);
router.use(aiLimiter);

// ── Main conversation turn ────────────────────────────────────────────────────
router.post('/chat',           authorize(...ALL_ROLES), chat);

// ── Standalone classification tools ──────────────────────────────────────────
router.post('/intent',         authorize(...ALL_ROLES), detectIntent);
router.post('/qualify',        authorize(...ALL_ROLES), qualify);

// ── Recommendations ───────────────────────────────────────────────────────────
router.get('/recommendations/:conversationId', authorize(...ALL_ROLES), getRecommendations);

// ── Summary ───────────────────────────────────────────────────────────────────
router.post('/summary',        authorize(...ALL_ROLES), summarize);

// ── Analytics ─────────────────────────────────────────────────────────────────
router.get('/analytics',       authorize(...MANAGER_AND_ABOVE), analytics);

// ── Session state ─────────────────────────────────────────────────────────────
router.get('/session/:conversationId', authorize(...ALL_ROLES), getSession);

export default router;
