/**
 * widget-platform.routes.ts
 *
 * All white-label widget platform endpoints.
 * Mounted at /api/v1/widget-platform
 */

import { Router } from 'express';
import { authenticate, authorize, requireOrganization } from '../middleware/authenticate';
import { ALL_ROLES, AGENT_AND_ABOVE, MANAGER_AND_ABOVE, OWNER_ADMIN, OWNER_ONLY } from '../config/permissions';
import {
  // Config
  getWidgetConfig, updateWidgetConfig, applyThemeToConfig, publishWidget, getPublishedConfig,
  // Themes
  listThemes, duplicateTheme, updateTheme, deleteTheme,
  // Deployments
  listDeployments, getDeployment, rollbackDeployment, diffDeployments,
  // Localization
  listLocalizations, upsertLocalization, deleteLocalization, getSupportedLocales,
  // Snippets
  getInstallSnippets, getInstallSnippet,
  // Preview
  getPreview,
  // Analytics
  trackWidgetEvent, getWidgetAnalytics,
  // A/B Tests
  listABTests, createABTest, startABTest, pauseABTest, promoteABWinner, deleteABTest,
  // Assets
  listAssets, registerAsset, deleteAsset, getAssetAllowedTypes,
} from '../controllers/widgetPlatformController';

const router = Router();

// Analytics track is called from the widget (no auth needed for tracking)
// All other routes require auth
router.post('/analytics/track', (req, res, next) => {
  // Resolve org from query param (widget passes its token)
  const token = req.query.token as string | undefined;
  if (token) {
    // Resolve org by slug — attach organizationId to req
    const { OrganizationModel } = require('../models/Organization.model');
    OrganizationModel.findOne({ $or: [{ slug: token }, { _id: token }], status: 'active' })
      .lean()
      .then((org: any) => {
        if (org) (req as any).organizationId = org._id.toString();
        next();
      })
      .catch(() => next());
  } else {
    next();
  }
}, trackWidgetEvent);

// All other routes require auth + org context
router.use(authenticate);
router.use(requireOrganization);

// ── Widget Configuration ──────────────────────────────────────────────────────
router.get('/config',              authorize(...ALL_ROLES),          getWidgetConfig);
router.patch('/config',            authorize(...OWNER_ADMIN),        updateWidgetConfig);
router.post('/config/apply-theme', authorize(...OWNER_ADMIN),        applyThemeToConfig);
router.post('/config/publish',     authorize(...OWNER_ADMIN),        publishWidget);
router.get('/config/published',    authorize(...ALL_ROLES),          getPublishedConfig);

// ── Themes ────────────────────────────────────────────────────────────────────
router.get('/themes',              authorize(...ALL_ROLES),          listThemes);
router.post('/themes/:id/duplicate',authorize(...OWNER_ADMIN),       duplicateTheme);
router.patch('/themes/:id',        authorize(...OWNER_ADMIN),        updateTheme);
router.delete('/themes/:id',       authorize(...OWNER_ADMIN),        deleteTheme);

// ── Deployments / Versions ────────────────────────────────────────────────────
router.get('/deployments',         authorize(...ALL_ROLES),          listDeployments);
router.get('/deployments/diff',    authorize(...MANAGER_AND_ABOVE),  diffDeployments);
router.get('/deployments/:id',     authorize(...ALL_ROLES),          getDeployment);
router.post('/deployments/:id/rollback', authorize(...OWNER_ADMIN),  rollbackDeployment);

// ── Localization ──────────────────────────────────────────────────────────────
router.get('/locales/supported',   authorize(...ALL_ROLES),          getSupportedLocales);
router.get('/locales',             authorize(...ALL_ROLES),          listLocalizations);
router.put('/locales',             authorize(...OWNER_ADMIN),        upsertLocalization);
router.delete('/locales/:localeCode', authorize(...OWNER_ADMIN),     deleteLocalization);

// ── Installation Snippets ─────────────────────────────────────────────────────
router.get('/snippets',            authorize(...ALL_ROLES),          getInstallSnippets);
router.get('/snippets/:platform',  authorize(...ALL_ROLES),          getInstallSnippet);

// ── Preview ───────────────────────────────────────────────────────────────────
router.post('/preview',            authorize(...AGENT_AND_ABOVE),    getPreview);

// ── Analytics ─────────────────────────────────────────────────────────────────
router.get('/analytics',           authorize(...MANAGER_AND_ABOVE),  getWidgetAnalytics);

// ── A/B Tests ─────────────────────────────────────────────────────────────────
router.get('/ab-tests',            authorize(...MANAGER_AND_ABOVE),  listABTests);
router.post('/ab-tests',           authorize(...OWNER_ADMIN),        createABTest);
router.post('/ab-tests/:id/start', authorize(...OWNER_ADMIN),        startABTest);
router.post('/ab-tests/:id/pause', authorize(...OWNER_ADMIN),        pauseABTest);
router.post('/ab-tests/:id/promote', authorize(...OWNER_ADMIN),      promoteABWinner);
router.delete('/ab-tests/:id',     authorize(...OWNER_ADMIN),        deleteABTest);

// ── Assets ────────────────────────────────────────────────────────────────────
router.get('/assets/allowed-types',authorize(...ALL_ROLES),          getAssetAllowedTypes);
router.get('/assets',              authorize(...ALL_ROLES),          listAssets);
router.post('/assets',             authorize(...OWNER_ADMIN),        registerAsset);
router.delete('/assets/:id',       authorize(...OWNER_ADMIN),        deleteAsset);

export default router;
