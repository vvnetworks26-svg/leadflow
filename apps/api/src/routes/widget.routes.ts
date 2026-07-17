/**
 * widget.routes.ts
 *
 * Public endpoints for the embeddable chat widget.
 * No authentication — organization is identified by the widget token (slug or ID).
 * Rate-limited more aggressively than authenticated routes.
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getWidgetConfig, widgetCreateLead, widgetCreateConversation, widgetChat, widgetBook, widgetCreateSession, widgetGetSession, widgetDeleteSession } from '../controllers/widgetController';

const router = Router();

/** Shared rate-limit error message body. */
const RATE_LIMITED_MESSAGE = { status: 'error', code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' };

/** Composite key: IP + org token — isolates budgets per visitor per organisation. */
const ipPlusToken = (req: import('express').Request) => `${req.ip}::${req.params.token ?? 'unknown'}`;

// Per-endpoint independent rate limiters (§8 Per-Endpoint Independent Budgets).
// None of these share a counter — each has its own in-memory store.

/** GET /:token/config — high-frequency polling allowed */
const configLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipPlusToken,
  message: RATE_LIMITED_MESSAGE,
});

/** POST /:token/session — short 60-second window to prevent session farming */
const sessionCreateLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipPlusToken,
  message: RATE_LIMITED_MESSAGE,
});

/** GET /:token/session/:id — session resume reads */
const sessionReadLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipPlusToken,
  message: RATE_LIMITED_MESSAGE,
});

/** DELETE /:token/session/:id — session archive / reset */
const sessionDeleteLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipPlusToken,
  message: RATE_LIMITED_MESSAGE,
});

/** POST /:token/chat — normal conversation turns */
const chatLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipPlusToken,
  message: RATE_LIMITED_MESSAGE,
});

/** POST /:token/book — booking submissions (intentionally strict) */
const bookLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipPlusToken,
  message: RATE_LIMITED_MESSAGE,
});

/** POST /:token/leads and POST /:token/conversations — general write operations */
const defaultLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipPlusToken,
  message: RATE_LIMITED_MESSAGE,
});

// All routes are scoped to a widget token (:token = org slug or org ID).
// Each route carries its own limiter — no shared router.use() blanket.
router.get('/:token/config',                        configLimiter,        getWidgetConfig);
router.post('/:token/session',                      sessionCreateLimiter, widgetCreateSession);
router.get('/:token/session/:widgetSessionId',      sessionReadLimiter,   widgetGetSession);
router.delete('/:token/session/:widgetSessionId',   sessionDeleteLimiter, widgetDeleteSession);
router.post('/:token/leads',                        defaultLimiter,       widgetCreateLead);
router.post('/:token/conversations',                defaultLimiter,       widgetCreateConversation);
router.post('/:token/chat',                         chatLimiter,          widgetChat);
router.post('/:token/book',                         bookLimiter,          widgetBook);

export default router;
