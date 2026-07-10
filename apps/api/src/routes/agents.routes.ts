/**
 * agents.routes.ts — AI Agent Platform endpoints.
 * Mounted at /api/v1/agents
 */

import { Router } from 'express';
import { authenticate, authorize, requireOrganization } from '../middleware/authenticate';
import { ALL_ROLES, AGENT_AND_ABOVE, MANAGER_AND_ABOVE, OWNER_ADMIN } from '../config/permissions';
import {
  listAgents, getAgent, createAgent, updateAgent, deleteAgent,
  chatWithAgent, listSessions, getSession, clearAgentMemory,
  listKnowledge, uploadKnowledge, deleteKnowledge, searchKnowledge,
  listMemory, searchMemory,
  listPrompts, createPrompt, updatePrompt, rollbackPrompt, deletePrompt, previewPrompt,
  listTools,
  getAgentAnalytics,
} from '../controllers/agentController';

const router = Router();
router.use(authenticate);
router.use(requireOrganization);

// ── Agent definitions ────────────────────────────────────────────────────────
router.get('/',                         authorize(...ALL_ROLES),          listAgents);
router.post('/',                        authorize(...OWNER_ADMIN),        createAgent);
router.get('/:id',                      authorize(...ALL_ROLES),          getAgent);
router.patch('/:id',                    authorize(...OWNER_ADMIN),        updateAgent);
router.delete('/:id',                   authorize(...OWNER_ADMIN),        deleteAgent);

// ── Chat (main reasoning loop) ────────────────────────────────────────────────
router.post('/:id/chat',                authorize(...AGENT_AND_ABOVE),    chatWithAgent);

// ── Sessions ─────────────────────────────────────────────────────────────────
router.get('/:id/sessions',             authorize(...MANAGER_AND_ABOVE),  listSessions);
router.get('/:id/sessions/:sessionId',  authorize(...MANAGER_AND_ABOVE),  getSession);
router.delete('/:id/memory',            authorize(...OWNER_ADMIN),        clearAgentMemory);

// ── Knowledge base ────────────────────────────────────────────────────────────
router.get('/knowledge/list',           authorize(...ALL_ROLES),          listKnowledge);
router.post('/knowledge/upload',        authorize(...MANAGER_AND_ABOVE),  uploadKnowledge);
router.get('/knowledge/search',         authorize(...ALL_ROLES),          searchKnowledge);
router.delete('/knowledge/:id',         authorize(...OWNER_ADMIN),        deleteKnowledge);

// ── Memory ────────────────────────────────────────────────────────────────────
router.get('/:agentId/memory',          authorize(...MANAGER_AND_ABOVE),  listMemory);
router.get('/:agentId/memory/search',   authorize(...MANAGER_AND_ABOVE),  searchMemory);

// ── Prompt templates ──────────────────────────────────────────────────────────
router.get('/prompts/list',             authorize(...ALL_ROLES),          listPrompts);
router.post('/prompts',                 authorize(...OWNER_ADMIN),        createPrompt);
router.patch('/prompts/:id',            authorize(...OWNER_ADMIN),        updatePrompt);
router.post('/prompts/:id/rollback',    authorize(...OWNER_ADMIN),        rollbackPrompt);
router.delete('/prompts/:id',           authorize(...OWNER_ADMIN),        deletePrompt);
router.post('/prompts/:id/preview',     authorize(...ALL_ROLES),          previewPrompt);

// ── Tools ─────────────────────────────────────────────────────────────────────
router.get('/tools/list',               authorize(...ALL_ROLES),          listTools);

// ── Analytics ─────────────────────────────────────────────────────────────────
router.get('/analytics/stats',          authorize(...MANAGER_AND_ABOVE),  getAgentAnalytics);

export default router;
