/**
 * dashboardController.ts
 *
 * All BI dashboard + realtime + report + export + notification handlers.
 * Every route reads organizationId from req.organizationId.
 */

import { Request, Response, NextFunction } from 'express';
import { randomUUID }              from 'crypto';
import { parseQuery }              from '../utils/validate';
import { ApiError }                from '../middleware/errorHandler';
import { z }                       from 'zod';

import { OverviewService }         from '../dashboard/overview/OverviewService';
import { SalesDashboardService }   from '../dashboard/sales/SalesDashboardService';
import { CrmDashboardService }     from '../dashboard/crm/CrmDashboardService';
import { AiDashboardService }      from '../dashboard/ai/AiDashboardService';
import { BookingDashboardService } from '../dashboard/bookings/BookingDashboardService';
import { WorkflowDashboardService }from '../dashboard/workflows/WorkflowDashboardService';
import { WidgetDashboardService }  from '../dashboard/widget/WidgetDashboardService';
import { RevenueDashboardService } from '../dashboard/revenue/RevenueDashboardService';
import { InsightsService }         from '../dashboard/insights/InsightsService';
import { ReportService }           from '../dashboard/reports/ReportService';
import { ExportService }           from '../dashboard/exports/ExportService';
import { NotificationCenterService } from '../dashboard/notifications/NotificationCenterService';
import { registerClient, broadcast, getConnectionCount } from '../dashboard/realtime/SseService';
import { invalidate }              from '../dashboard/cache/DashboardCache';
import { SavedViewModel }          from '../models/SavedView.model';

// ─── Overview ────────────────────────────────────────────────────────────────

export async function getOverview(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await OverviewService.get(req.organizationId!);
    res.json({ status: 'ok', data });
  } catch (e) { next(e); }
}

// ─── Section dashboards ───────────────────────────────────────────────────────

export async function getSalesDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const since = req.query.since ? new Date(String(req.query.since)) : undefined;
    const data  = await SalesDashboardService.get(req.organizationId!, since);
    res.json({ status: 'ok', data });
  } catch (e) { next(e); }
}

export async function getCrmDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await CrmDashboardService.get(req.organizationId!);
    res.json({ status: 'ok', data });
  } catch (e) { next(e); }
}

export async function getAiDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await AiDashboardService.get(req.organizationId!);
    res.json({ status: 'ok', data });
  } catch (e) { next(e); }
}

export async function getBookingDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await BookingDashboardService.get(req.organizationId!);
    res.json({ status: 'ok', data });
  } catch (e) { next(e); }
}

export async function getWorkflowDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await WorkflowDashboardService.get(req.organizationId!);
    res.json({ status: 'ok', data });
  } catch (e) { next(e); }
}

export async function getWidgetDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await WidgetDashboardService.get(req.organizationId!);
    res.json({ status: 'ok', data });
  } catch (e) { next(e); }
}

export async function getRevenueDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await RevenueDashboardService.get(req.organizationId!);
    res.json({ status: 'ok', data });
  } catch (e) { next(e); }
}

// ─── All-in-one ───────────────────────────────────────────────────────────────

export async function getFullDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const orgId = req.organizationId!;
    const [overview, sales, crm, revenue] = await Promise.all([
      OverviewService.get(orgId),
      SalesDashboardService.get(orgId),
      CrmDashboardService.get(orgId),
      RevenueDashboardService.get(orgId),
    ]);
    res.json({ status: 'ok', data: { overview, sales, crm, revenue } });
  } catch (e) { next(e); }
}

// ─── AI Insights ──────────────────────────────────────────────────────────────

export async function getInsights(req: Request, res: Response, next: NextFunction) {
  try {
    const insights = await InsightsService.generate(req.organizationId!);
    res.json({ status: 'ok', data: insights });
  } catch (e) { next(e); }
}

// ─── Reports ──────────────────────────────────────────────────────────────────

const ReportQuerySchema = z.object({
  period:    z.enum(['daily','weekly','monthly','quarterly','custom']).default('monthly'),
  fromDate:  z.string().optional(),
  toDate:    z.string().optional(),
  sections:  z.string().optional().default('all'),
  format:    z.enum(['json','csv']).optional().default('json'),
});

export async function generateReport(req: Request, res: Response, next: NextFunction) {
  try {
    const q        = parseQuery(ReportQuerySchema, req.query);
    const sections = (q.sections ?? 'all') === 'all' ? ['all'] : (q.sections ?? 'all').split(',');
    const report   = await ReportService.generate({
      organizationId: req.organizationId!,
      period:         (q.period ?? 'monthly') as any,
      fromDate:       q.fromDate  ? new Date(q.fromDate)  : undefined,
      toDate:         q.toDate    ? new Date(q.toDate)     : undefined,
      sections,
    });

    if (q.format === 'csv') {
      const csv = ReportService.toCsv(report);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="leadflow-report-${q.period}.csv"`);
      res.send(csv);
      return;
    }

    res.json({ status: 'ok', data: report });
  } catch (e) { next(e); }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export async function exportData(req: Request, res: Response, next: NextFunction) {
  try {
    const entity  = String(req.query.entity ?? 'leads') as any;
    const { csv, filename } = await ExportService.export(req.organizationId!, entity);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (e) { next(e); }
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function listNotifications(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await NotificationCenterService.list(req.organizationId!, req.user!.sub, {
      unread: req.query.unread ? req.query.unread === 'true' : undefined,
      page:   Number(req.query.page  ?? 1),
      limit:  Number(req.query.limit ?? 30),
    });
    res.json({ status: 'ok', ...result });
  } catch (e) { next(e); }
}

export async function getUnreadCount(req: Request, res: Response, next: NextFunction) {
  try {
    const count = await NotificationCenterService.getUnreadCount(req.organizationId!, req.user!.sub);
    res.json({ status: 'ok', data: { count } });
  } catch (e) { next(e); }
}

export async function markNotificationRead(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id);
    await NotificationCenterService.markRead(req.organizationId!, req.user!.sub, id);
    res.json({ status: 'ok' });
  } catch (e) { next(e); }
}

export async function markAllNotificationsRead(req: Request, res: Response, next: NextFunction) {
  try {
    await NotificationCenterService.markAllRead(req.organizationId!, req.user!.sub);
    res.json({ status: 'ok' });
  } catch (e) { next(e); }
}

export async function deleteNotification(req: Request, res: Response, next: NextFunction) {
  try {
    await NotificationCenterService.delete(req.organizationId!, req.user!.sub, String(req.params.id));
    res.status(204).send();
  } catch (e) { next(e); }
}

// ─── SSE Real-time stream ─────────────────────────────────────────────────────

export function sseStream(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = randomUUID();
    registerClient(clientId, req.organizationId!, req.user!.sub, res);
    // Keep the connection alive — Express won't call next()
  } catch (e) { next(e); }
}

export function sseTest(req: Request, res: Response, next: NextFunction) {
  try {
    const event = String(req.query.event ?? 'notification') as any;
    broadcast(req.organizationId!, event, { test: true, message: 'Test SSE event', ts: new Date().toISOString() });
    res.json({ status: 'ok', data: { connections: getConnectionCount(req.organizationId!) } });
  } catch (e) { next(e); }
}

// ─── Cache invalidation ───────────────────────────────────────────────────────

export async function invalidateCache(req: Request, res: Response, next: NextFunction) {
  try {
    const key = req.query.key as string | undefined;
    await invalidate(req.organizationId!, key);
    res.json({ status: 'ok', message: 'Cache invalidated' });
  } catch (e) { next(e); }
}

// ─── Saved Views ──────────────────────────────────────────────────────────────

export async function listSavedViews(req: Request, res: Response, next: NextFunction) {
  try {
    const section = req.query.section as string | undefined;
    const filter: Record<string, unknown> = { organizationId: req.organizationId!, userId: req.user!.sub };
    if (section) filter.dashboardSection = section;
    const views = await SavedViewModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ status: 'ok', data: views });
  } catch (e) { next(e); }
}

export async function createSavedView(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, dashboardSection, filters, isDefault } = req.body;
    if (!name || !dashboardSection) throw new ApiError(422, 'name and dashboardSection required', 'VALIDATION_ERROR');
    const view = await SavedViewModel.create({
      organizationId: req.organizationId!, userId: req.user!.sub,
      name, dashboardSection, filters: filters ?? {}, isDefault: isDefault ?? false,
    });
    res.status(201).json({ status: 'ok', data: view });
  } catch (e) { next(e); }
}

export async function deleteSavedView(req: Request, res: Response, next: NextFunction) {
  try {
    await SavedViewModel.findOneAndDelete({ _id: req.params.id, organizationId: req.organizationId!, userId: req.user!.sub });
    res.status(204).send();
  } catch (e) { next(e); }
}
