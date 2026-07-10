/**
 * communications.routes.ts — All omnichannel communications endpoints.
 * Mounted at /api/v1/comms
 */

import { Router } from 'express';
import { authenticate, authorize, requireOrganization } from '../middleware/authenticate';
import { ALL_ROLES, AGENT_AND_ABOVE, MANAGER_AND_ABOVE, OWNER_ADMIN } from '../config/permissions';
import {
  // Threads / Inbox
  listThreads, getThread, createThread, assignThread, updateThreadStatus,
  addLabel, removeLabel, pinThread, starThread, deleteThread,
  getThreadTimeline, markThreadRead,
  // Messages
  sendMessage, getMessage, deleteMessage,
  // Templates
  listTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate, previewTemplate,
  // Campaigns
  listCampaigns, getCampaign, createCampaign, updateCampaign,
  sendCampaign, pauseCampaign, deleteCampaign,
  // Attachments
  listAttachments, registerAttachment,
  // AI
  analyzeThread, suggestReply,
  // Channel accounts
  listChannelAccounts, createChannelAccount, updateChannelAccount, deleteChannelAccount,
  // Inbox rules
  listInboxRules, createInboxRule, updateInboxRule, deleteInboxRule,
  // Search
  searchMessages,
  // Webhooks (public)
  handleInboundWebhook,
} from '../controllers/communicationsController';

const router = Router();

// ── Public webhook endpoint (no auth — verified by HMAC or token) ─────────────
router.post('/webhooks/inbound/:channel', handleInboundWebhook);

// ── All other routes require auth + org context ────────────────────────────────
router.use(authenticate);
router.use(requireOrganization);

// ── Inbox / Threads ───────────────────────────────────────────────────────────
router.get('/threads',                        authorize(...ALL_ROLES),          listThreads);
router.post('/threads',                       authorize(...AGENT_AND_ABOVE),    createThread);
router.get('/threads/:id',                    authorize(...ALL_ROLES),          getThread);
router.delete('/threads/:id',                 authorize(...OWNER_ADMIN),        deleteThread);
router.patch('/threads/:id/assign',           authorize(...AGENT_AND_ABOVE),    assignThread);
router.patch('/threads/:id/status',           authorize(...AGENT_AND_ABOVE),    updateThreadStatus);
router.post('/threads/:id/labels',            authorize(...AGENT_AND_ABOVE),    addLabel);
router.delete('/threads/:id/labels/:label',   authorize(...AGENT_AND_ABOVE),    removeLabel);
router.patch('/threads/:id/pin',              authorize(...AGENT_AND_ABOVE),    pinThread);
router.patch('/threads/:id/star',             authorize(...AGENT_AND_ABOVE),    starThread);
router.patch('/threads/:id/read',             authorize(...ALL_ROLES),          markThreadRead);
router.get('/threads/:id/timeline',           authorize(...ALL_ROLES),          getThreadTimeline);

// ── AI on threads ─────────────────────────────────────────────────────────────
router.get('/threads/:id/analyze',            authorize(...AGENT_AND_ABOVE),    analyzeThread);
router.get('/threads/:id/suggest-reply',      authorize(...AGENT_AND_ABOVE),    suggestReply);

// ── Messages ─────────────────────────────────────────────────────────────────
router.post('/messages',                      authorize(...AGENT_AND_ABOVE),    sendMessage);
router.get('/messages/:id',                   authorize(...ALL_ROLES),          getMessage);
router.delete('/messages/:id',                authorize(...OWNER_ADMIN),        deleteMessage);

// ── Attachments ───────────────────────────────────────────────────────────────
router.get('/threads/:threadId/attachments',  authorize(...ALL_ROLES),          listAttachments);
router.post('/attachments',                   authorize(...AGENT_AND_ABOVE),    registerAttachment);

// ── Templates ─────────────────────────────────────────────────────────────────
router.get('/templates',                      authorize(...ALL_ROLES),          listTemplates);
router.post('/templates',                     authorize(...MANAGER_AND_ABOVE),  createTemplate);
router.get('/templates/:id',                  authorize(...ALL_ROLES),          getTemplate);
router.patch('/templates/:id',                authorize(...MANAGER_AND_ABOVE),  updateTemplate);
router.delete('/templates/:id',               authorize(...OWNER_ADMIN),        deleteTemplate);
router.post('/templates/:id/preview',         authorize(...ALL_ROLES),          previewTemplate);

// ── Campaigns ─────────────────────────────────────────────────────────────────
router.get('/campaigns',                      authorize(...MANAGER_AND_ABOVE),  listCampaigns);
router.post('/campaigns',                     authorize(...MANAGER_AND_ABOVE),  createCampaign);
router.get('/campaigns/:id',                  authorize(...MANAGER_AND_ABOVE),  getCampaign);
router.patch('/campaigns/:id',                authorize(...MANAGER_AND_ABOVE),  updateCampaign);
router.post('/campaigns/:id/send',            authorize(...OWNER_ADMIN),        sendCampaign);
router.post('/campaigns/:id/pause',           authorize(...OWNER_ADMIN),        pauseCampaign);
router.delete('/campaigns/:id',               authorize(...OWNER_ADMIN),        deleteCampaign);

// ── Channel Accounts ──────────────────────────────────────────────────────────
router.get('/accounts',                       authorize(...MANAGER_AND_ABOVE),  listChannelAccounts);
router.post('/accounts',                      authorize(...OWNER_ADMIN),        createChannelAccount);
router.patch('/accounts/:id',                 authorize(...OWNER_ADMIN),        updateChannelAccount);
router.delete('/accounts/:id',                authorize(...OWNER_ADMIN),        deleteChannelAccount);

// ── Inbox Rules ───────────────────────────────────────────────────────────────
router.get('/rules',                          authorize(...MANAGER_AND_ABOVE),  listInboxRules);
router.post('/rules',                         authorize(...OWNER_ADMIN),        createInboxRule);
router.patch('/rules/:id',                    authorize(...OWNER_ADMIN),        updateInboxRule);
router.delete('/rules/:id',                   authorize(...OWNER_ADMIN),        deleteInboxRule);

// ── Search ────────────────────────────────────────────────────────────────────
router.get('/search',                         authorize(...ALL_ROLES),          searchMessages);

export default router;
