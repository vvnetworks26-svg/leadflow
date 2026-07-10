/**
 * automation.routes.ts — All workflow automation endpoints.
 * Mounted at /api/v1/automation
 */

import { Router } from 'express';
import { authenticate, authorize, requireOrganization } from '../middleware/authenticate';
import { ALL_ROLES, AGENT_AND_ABOVE, MANAGER_AND_ABOVE, OWNER_ADMIN } from '../config/permissions';
import {
  listWorkflows, getWorkflow, createWorkflow, updateWorkflow, deleteWorkflow, toggleWorkflow,
  executeWorkflow, listExecutions, getExecution, cancelExecution,
  listTemplates, createFromTemplate,
  listFolders, createFolder, deleteFolder,
  listWebhooks, createWebhook, deleteWebhook, incomingWebhook,
  getAutomationAnalytics,
} from '../controllers/automationController';

const router = Router();

// Public: incoming webhooks (no auth, HMAC verified)
router.post('/webhooks/incoming/:endpoint', incomingWebhook);

// All other routes require auth + org context
router.use(authenticate);
router.use(requireOrganization);

// ── Workflows ────────────────────────────────────────────────────────────────
router.get('/',                         authorize(...ALL_ROLES),          listWorkflows);
router.post('/',                        authorize(...MANAGER_AND_ABOVE),  createWorkflow);
router.get('/:id',                      authorize(...ALL_ROLES),          getWorkflow);
router.patch('/:id',                    authorize(...MANAGER_AND_ABOVE),  updateWorkflow);
router.delete('/:id',                   authorize(...OWNER_ADMIN),        deleteWorkflow);
router.patch('/:id/toggle',             authorize(...MANAGER_AND_ABOVE),  toggleWorkflow);

// ── Execution ────────────────────────────────────────────────────────────────
router.post('/:id/execute',             authorize(...MANAGER_AND_ABOVE),  executeWorkflow);
router.get('/:id/executions',           authorize(...ALL_ROLES),          listExecutions);
router.get('/:id/executions/:executionId', authorize(...ALL_ROLES),       getExecution);
router.post('/:id/executions/:executionId/cancel', authorize(...MANAGER_AND_ABOVE), cancelExecution);

// ── Templates ────────────────────────────────────────────────────────────────
router.get('/templates/list',           authorize(...ALL_ROLES),          listTemplates);
router.post('/templates/:id/use',       authorize(...MANAGER_AND_ABOVE),  createFromTemplate);

// ── Folders ──────────────────────────────────────────────────────────────────
router.get('/folders/list',             authorize(...ALL_ROLES),          listFolders);
router.post('/folders',                 authorize(...MANAGER_AND_ABOVE),  createFolder);
router.delete('/folders/:id',           authorize(...OWNER_ADMIN),        deleteFolder);

// ── Webhooks ──────────────────────────────────────────────────────────────────
router.get('/webhooks/list',            authorize(...MANAGER_AND_ABOVE),  listWebhooks);
router.post('/webhooks',                authorize(...OWNER_ADMIN),        createWebhook);
router.delete('/webhooks/:id',          authorize(...OWNER_ADMIN),        deleteWebhook);

// ── Analytics ────────────────────────────────────────────────────────────────
router.get('/analytics/stats',          authorize(...MANAGER_AND_ABOVE),  getAutomationAnalytics);

export default router;
