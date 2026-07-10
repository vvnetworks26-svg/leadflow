/**
 * dashboard.routes.ts — All BI dashboard endpoints.
 * Mounted at /api/v1/dashboard
 */

import { Router } from 'express';
import { authenticate, authorize, requireOrganization } from '../middleware/authenticate';
import { ALL_ROLES, MANAGER_AND_ABOVE, OWNER_ADMIN } from '../config/permissions';
import {
  getOverview, getFullDashboard,
  getSalesDashboard, getCrmDashboard, getAiDashboard,
  getBookingDashboard, getWorkflowDashboard, getWidgetDashboard, getRevenueDashboard,
  getInsights,
  generateReport, exportData,
  listNotifications, getUnreadCount, markNotificationRead, markAllNotificationsRead, deleteNotification,
  sseStream, sseTest,
  invalidateCache,
  listSavedViews, createSavedView, deleteSavedView,
} from '../controllers/dashboardController';

const router = Router();

// SSE stream (authenticated — must be first to avoid body parsing issues)
router.get('/realtime/stream', authenticate, requireOrganization, authorize(...ALL_ROLES), sseStream);
router.post('/realtime/test',  authenticate, requireOrganization, authorize(...OWNER_ADMIN), sseTest);

router.use(authenticate);
router.use(requireOrganization);

// ── Overview ─────────────────────────────────────────────────────────────────
router.get('/',            authorize(...ALL_ROLES),          getOverview);
router.get('/full',        authorize(...ALL_ROLES),          getFullDashboard);

// ── Section dashboards ────────────────────────────────────────────────────────
router.get('/sales',       authorize(...MANAGER_AND_ABOVE),  getSalesDashboard);
router.get('/crm',         authorize(...ALL_ROLES),          getCrmDashboard);
router.get('/ai',          authorize(...MANAGER_AND_ABOVE),  getAiDashboard);
router.get('/bookings',    authorize(...ALL_ROLES),          getBookingDashboard);
router.get('/workflows',   authorize(...MANAGER_AND_ABOVE),  getWorkflowDashboard);
router.get('/widget',      authorize(...MANAGER_AND_ABOVE),  getWidgetDashboard);
router.get('/revenue',     authorize(...MANAGER_AND_ABOVE),  getRevenueDashboard);

// ── AI Insights ───────────────────────────────────────────────────────────────
router.get('/insights',    authorize(...MANAGER_AND_ABOVE),  getInsights);

// ── Reports ───────────────────────────────────────────────────────────────────
router.get('/reports',     authorize(...MANAGER_AND_ABOVE),  generateReport);

// ── Exports (CSV) ─────────────────────────────────────────────────────────────
router.get('/export',      authorize(...MANAGER_AND_ABOVE),  exportData);

// ── Notifications ─────────────────────────────────────────────────────────────
router.get('/notifications',               authorize(...ALL_ROLES),  listNotifications);
router.get('/notifications/unread-count',  authorize(...ALL_ROLES),  getUnreadCount);
router.patch('/notifications/read-all',    authorize(...ALL_ROLES),  markAllNotificationsRead);
router.patch('/notifications/:id/read',    authorize(...ALL_ROLES),  markNotificationRead);
router.delete('/notifications/:id',        authorize(...ALL_ROLES),  deleteNotification);

// ── Saved Views ───────────────────────────────────────────────────────────────
router.get('/views',       authorize(...ALL_ROLES),          listSavedViews);
router.post('/views',      authorize(...ALL_ROLES),          createSavedView);
router.delete('/views/:id',authorize(...ALL_ROLES),          deleteSavedView);

// ── Cache ─────────────────────────────────────────────────────────────────────
router.post('/cache/invalidate', authorize(...OWNER_ADMIN),  invalidateCache);

export default router;
