/**
 * widget.routes.ts
 *
 * Public endpoints for the embeddable chat widget.
 * No authentication — organization is identified by the widget token (slug or ID).
 * Rate-limited more aggressively than authenticated routes.
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getWidgetConfig, widgetCreateLead, widgetCreateConversation, widgetChat } from '../controllers/widgetController';

const router = Router();

/** Widget endpoints: 60 requests per 15 min per IP (stricter than global 200). */
const widgetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' },
});

router.use(widgetLimiter);

// All routes are scoped to a widget token (:token = org slug or org ID)
router.get('/:token/config',         getWidgetConfig);
router.post('/:token/leads',         widgetCreateLead);
router.post('/:token/conversations', widgetCreateConversation);
router.post('/:token/chat',          widgetChat);

export default router;
