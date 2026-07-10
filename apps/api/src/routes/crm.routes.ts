/**
 * crm.routes.ts
 *
 * All CRM API endpoints — organization-scoped, authenticated.
 * Mounted at /api/v1/crm
 */

import { Router }   from 'express';
import { authenticate, authorize, requireOrganization } from '../middleware/authenticate';
import { ALL_ROLES, AGENT_AND_ABOVE, MANAGER_AND_ABOVE, OWNER_ADMIN, OWNER_ONLY } from '../config/permissions';
import {
  // Pipelines
  listPipelines, getPipeline, createPipeline, updatePipeline, deletePipeline,
  addStage, updateStage, deleteStage, reorderStages,
  // Kanban
  getKanban, moveLeadStage,
  // Companies
  listCompanies, getCompany, createCompany, updateCompany, deleteCompany,
  getCompanyStats, findCompanyDuplicates,
  // Contacts
  listContacts, getContact, createContact, updateContact, deleteContact, mergeContacts,
  // Activities / Timeline
  getLeadTimeline, getActivityFeed, logActivity,
  // Notes
  listNotes, createNote, updateNote, deleteNote, pinNote,
  // Tasks
  listTasks, createTask, updateTask, completeTask, deleteTask,
  // Tags
  listTags, suggestTags, createTag, updateTag, deleteTag,
  // Search
  globalSearch,
  // Dashboard
  getDashboard,
  // Automation
  listAutomations, createAutomation, updateAutomation, toggleAutomation, deleteAutomation,
  // Duplicates
  detectLeadDuplicates, mergeLeads,
  // Saved Filters
  listSavedFilters, createSavedFilter, deleteSavedFilter,
} from '../controllers/crmController';

const router = Router();
router.use(authenticate);
router.use(requireOrganization);

// ── Dashboard ─────────────────────────────────────────────────────────────────
router.get('/dashboard',              authorize(...ALL_ROLES),         getDashboard);

// ── Search ────────────────────────────────────────────────────────────────────
router.get('/search',                 authorize(...ALL_ROLES),         globalSearch);

// ── Pipelines ─────────────────────────────────────────────────────────────────
router.get('/pipelines',              authorize(...ALL_ROLES),         listPipelines);
router.post('/pipelines',             authorize(...OWNER_ADMIN),       createPipeline);
router.get('/pipelines/:id',          authorize(...ALL_ROLES),         getPipeline);
router.patch('/pipelines/:id',        authorize(...OWNER_ADMIN),       updatePipeline);
router.delete('/pipelines/:id',       authorize(...OWNER_ADMIN),       deletePipeline);

// Stages
router.post('/pipelines/:id/stages',                   authorize(...OWNER_ADMIN), addStage);
router.patch('/pipelines/:id/stages/:stageId',         authorize(...OWNER_ADMIN), updateStage);
router.delete('/pipelines/:id/stages/:stageId',        authorize(...OWNER_ADMIN), deleteStage);
router.post('/pipelines/:id/stages/reorder',           authorize(...OWNER_ADMIN), reorderStages);

// ── Kanban ────────────────────────────────────────────────────────────────────
router.get('/kanban/:pipelineId',      authorize(...ALL_ROLES),        getKanban);
router.patch('/leads/:id/stage',       authorize(...AGENT_AND_ABOVE),  moveLeadStage);

// ── Companies ─────────────────────────────────────────────────────────────────
router.get('/companies',              authorize(...ALL_ROLES),         listCompanies);
router.post('/companies',             authorize(...AGENT_AND_ABOVE),   createCompany);
router.get('/companies/duplicates',   authorize(...AGENT_AND_ABOVE),   findCompanyDuplicates);
router.get('/companies/:id',          authorize(...ALL_ROLES),         getCompany);
router.patch('/companies/:id',        authorize(...AGENT_AND_ABOVE),   updateCompany);
router.delete('/companies/:id',       authorize(...OWNER_ADMIN),       deleteCompany);
router.get('/companies/:id/stats',    authorize(...ALL_ROLES),         getCompanyStats);

// ── Contacts ──────────────────────────────────────────────────────────────────
router.get('/contacts',               authorize(...ALL_ROLES),         listContacts);
router.post('/contacts',              authorize(...AGENT_AND_ABOVE),   createContact);
router.get('/contacts/:id',           authorize(...ALL_ROLES),         getContact);
router.patch('/contacts/:id',         authorize(...AGENT_AND_ABOVE),   updateContact);
router.delete('/contacts/:id',        authorize(...OWNER_ADMIN),       deleteContact);
router.post('/contacts/merge',        authorize(...OWNER_ADMIN),       mergeContacts);

// ── Activities / Timeline ─────────────────────────────────────────────────────
router.get('/timeline/:leadId',       authorize(...ALL_ROLES),         getLeadTimeline);
router.get('/activities',             authorize(...ALL_ROLES),         getActivityFeed);
router.post('/activities',            authorize(...AGENT_AND_ABOVE),   logActivity);

// ── Notes ─────────────────────────────────────────────────────────────────────
router.get('/leads/:leadId/notes',    authorize(...ALL_ROLES),         listNotes);
router.post('/notes',                 authorize(...AGENT_AND_ABOVE),   createNote);
router.patch('/notes/:id',            authorize(...AGENT_AND_ABOVE),   updateNote);
router.delete('/notes/:id',           authorize(...OWNER_ADMIN),       deleteNote);
router.patch('/notes/:id/pin',        authorize(...AGENT_AND_ABOVE),   pinNote);

// ── Tasks ─────────────────────────────────────────────────────────────────────
router.get('/tasks',                  authorize(...ALL_ROLES),         listTasks);
router.post('/tasks',                 authorize(...AGENT_AND_ABOVE),   createTask);
router.patch('/tasks/:id',            authorize(...AGENT_AND_ABOVE),   updateTask);
router.post('/tasks/:id/complete',    authorize(...AGENT_AND_ABOVE),   completeTask);
router.delete('/tasks/:id',           authorize(...OWNER_ADMIN),       deleteTask);

// ── Tags ──────────────────────────────────────────────────────────────────────
router.get('/tags',                   authorize(...ALL_ROLES),         listTags);
router.get('/tags/suggest',           authorize(...ALL_ROLES),         suggestTags);
router.post('/tags',                  authorize(...AGENT_AND_ABOVE),   createTag);
router.patch('/tags/:id',             authorize(...AGENT_AND_ABOVE),   updateTag);
router.delete('/tags/:id',            authorize(...OWNER_ADMIN),       deleteTag);

// ── Duplicates ────────────────────────────────────────────────────────────────
router.post('/duplicates/leads/detect', authorize(...AGENT_AND_ABOVE), detectLeadDuplicates);
router.post('/duplicates/leads/merge',  authorize(...OWNER_ADMIN),     mergeLeads);

// ── Automation ────────────────────────────────────────────────────────────────
router.get('/automation',             authorize(...MANAGER_AND_ABOVE), listAutomations);
router.post('/automation',            authorize(...OWNER_ADMIN),       createAutomation);
router.patch('/automation/:id',       authorize(...OWNER_ADMIN),       updateAutomation);
router.patch('/automation/:id/toggle',authorize(...OWNER_ADMIN),       toggleAutomation);
router.delete('/automation/:id',      authorize(...OWNER_ADMIN),       deleteAutomation);

// ── Saved Filters ─────────────────────────────────────────────────────────────
router.get('/filters',                authorize(...ALL_ROLES),         listSavedFilters);
router.post('/filters',               authorize(...ALL_ROLES),         createSavedFilter);
router.delete('/filters/:id',         authorize(...ALL_ROLES),         deleteSavedFilter);

export default router;
