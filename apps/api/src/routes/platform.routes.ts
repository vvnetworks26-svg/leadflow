/**
 * platform.routes.ts — Enterprise Platform endpoints.
 * Mounted at /api/v1/platform
 */

import { Router } from 'express';
import { authenticate, authorize, requireOrganization } from '../middleware/authenticate';
import { ALL_ROLES, MANAGER_AND_ABOVE, OWNER_ADMIN, OWNER_ONLY } from '../config/permissions';
import {
  listApiKeys, createApiKey, rotateApiKey, revokeApiKey,
  listWebhooks, createWebhook, deleteWebhook, replayWebhook,
  listMarketplaceApps, getMarketplaceApp, listInstalledApps, installApp, uninstallApp, updateAppConfig,
  listIntegrations, connectIntegration, disconnectIntegration, testIntegration,
  getWhiteLabel, updateWhiteLabel, getPublicBranding,
  listSsoConfigs, upsertSsoConfig, testSsoConfig, getSsoAuthUrl,
  listComplianceLogs, exportLeadData, deleteLeadData, getRetentionReport,
  createImportJob, listImportJobs, getImportJob, createExportJob,
  listDeveloperApps, createDeveloperApp, rotateDeveloperSecret, deleteDeveloperApp, getApiDocs,
  listPlatformAuditLogs, exportPlatformAuditLogs,
} from '../controllers/platformController';

const router = Router();

// ── Public endpoints ──────────────────────────────────────────────────────────
router.get('/branding', getPublicBranding);     // public white-label config
router.get('/developer/docs', getApiDocs);      // public API docs metadata

// ── All other routes require auth + org context ────────────────────────────────
router.use(authenticate);
router.use(requireOrganization);

// ── API Keys ──────────────────────────────────────────────────────────────────
router.get('/api-keys',              authorize(...OWNER_ADMIN),        listApiKeys);
router.post('/api-keys',             authorize(...OWNER_ADMIN),        createApiKey);
router.post('/api-keys/:id/rotate',  authorize(...OWNER_ADMIN),        rotateApiKey);
router.delete('/api-keys/:id',       authorize(...OWNER_ONLY),         revokeApiKey);

// ── Webhooks ──────────────────────────────────────────────────────────────────
router.get('/webhooks',              authorize(...OWNER_ADMIN),        listWebhooks);
router.post('/webhooks',             authorize(...OWNER_ADMIN),        createWebhook);
router.delete('/webhooks/:id',       authorize(...OWNER_ONLY),         deleteWebhook);
router.post('/webhooks/:id/replay',  authorize(...OWNER_ADMIN),        replayWebhook);

// ── Marketplace ───────────────────────────────────────────────────────────────
router.get('/marketplace',           authorize(...ALL_ROLES),          listMarketplaceApps);
router.get('/marketplace/:slug',     authorize(...ALL_ROLES),          getMarketplaceApp);
router.get('/marketplace/installed/list', authorize(...ALL_ROLES),     listInstalledApps);
router.post('/marketplace/:slug/install',  authorize(...OWNER_ADMIN),  installApp);
router.delete('/marketplace/:slug/uninstall', authorize(...OWNER_ONLY),uninstallApp);
router.patch('/marketplace/:slug/config', authorize(...OWNER_ADMIN),   updateAppConfig);

// ── Integrations ──────────────────────────────────────────────────────────────
router.get('/integrations',          authorize(...MANAGER_AND_ABOVE),  listIntegrations);
router.post('/integrations',         authorize(...OWNER_ADMIN),        connectIntegration);
router.delete('/integrations/:id',   authorize(...OWNER_ONLY),         disconnectIntegration);
router.post('/integrations/:id/test',authorize(...OWNER_ADMIN),        testIntegration);

// ── White Label ───────────────────────────────────────────────────────────────
router.get('/white-label',           authorize(...ALL_ROLES),          getWhiteLabel);
router.put('/white-label',           authorize(...OWNER_ONLY),         updateWhiteLabel);

// ── SSO ───────────────────────────────────────────────────────────────────────
router.get('/sso',                   authorize(...OWNER_ADMIN),        listSsoConfigs);
router.put('/sso',                   authorize(...OWNER_ONLY),         upsertSsoConfig);
router.post('/sso/:provider/test',   authorize(...OWNER_ADMIN),        testSsoConfig);
router.get('/sso/:provider/url',     authorize(...OWNER_ADMIN),        getSsoAuthUrl);

// ── Compliance ────────────────────────────────────────────────────────────────
router.get('/compliance/logs',         authorize(...OWNER_ADMIN),       listComplianceLogs);
router.post('/compliance/export-data', authorize(...OWNER_ONLY),        exportLeadData);
router.post('/compliance/delete-data', authorize(...OWNER_ONLY),        deleteLeadData);
router.get('/compliance/retention',    authorize(...OWNER_ADMIN),       getRetentionReport);

// ── Import / Export ───────────────────────────────────────────────────────────
router.get('/imports',               authorize(...MANAGER_AND_ABOVE),  listImportJobs);
router.post('/imports',              authorize(...MANAGER_AND_ABOVE),  createImportJob);
router.get('/imports/:id',           authorize(...MANAGER_AND_ABOVE),  getImportJob);
router.get('/exports',               authorize(...MANAGER_AND_ABOVE),  createExportJob);

// ── Developer ─────────────────────────────────────────────────────────────────
router.get('/developer/apps',                    authorize(...OWNER_ADMIN),  listDeveloperApps);
router.post('/developer/apps',                   authorize(...OWNER_ONLY),   createDeveloperApp);
router.post('/developer/apps/:id/rotate-secret', authorize(...OWNER_ONLY),  rotateDeveloperSecret);
router.delete('/developer/apps/:id',             authorize(...OWNER_ONLY),   deleteDeveloperApp);

// ── Platform Audit ────────────────────────────────────────────────────────────
router.get('/audit',                 authorize(...OWNER_ADMIN),        listPlatformAuditLogs);
router.get('/audit/export',          authorize(...OWNER_ONLY),         exportPlatformAuditLogs);

export default router;
