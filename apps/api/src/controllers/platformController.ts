/**
 * platformController.ts — All Enterprise Platform API handlers.
 */

import { Request, Response, NextFunction } from 'express';
import { param }                    from '../utils/params';
import { ApiError }                 from '../middleware/errorHandler';

import { ApiKeyService }            from '../platform/api-keys/ApiKeyService';
import { WebhookDispatcher }        from '../platform/webhooks/WebhookDispatcher';
import { MarketplaceService }       from '../platform/marketplace/MarketplaceService';
import { WhiteLabelService }        from '../platform/white-label/WhiteLabelService';
import { ComplianceService }        from '../platform/compliance/ComplianceService';
import { ImportService }            from '../platform/imports/ImportService';
import { IntegrationService }       from '../platform/integrations/IntegrationService';
import { SsoService }               from '../platform/sso/SsoService';
import { DeveloperService }         from '../platform/developer/DeveloperService';
import { PlatformAuditService }     from '../platform/audit/PlatformAuditService';
import { ExportService }            from '../dashboard/exports/ExportService';
import { ImportExportJobModel }     from '../models/ImportExportJob.model';

// ─── API Keys ──────────────────────────────────────────────────────────────────

export async function listApiKeys(req: Request, res: Response, next: NextFunction) {
  try {
    const keys = await ApiKeyService.list(req.organizationId!);
    res.json({ status: 'ok', data: keys });
  } catch (e) { next(e); }
}

export async function createApiKey(req: Request, res: Response, next: NextFunction) {
  try {
    const { apiKey, rawKey } = await ApiKeyService.create(req.organizationId!, req.user!.sub, req.body);
    res.status(201).json({ status: 'ok', data: { ...apiKey, rawKey } });
  } catch (e) { next(e); }
}

export async function rotateApiKey(req: Request, res: Response, next: NextFunction) {
  try {
    const { apiKey, rawKey } = await ApiKeyService.rotate(req.organizationId!, param(req.params.id), req.user!.sub);
    res.json({ status: 'ok', data: { ...apiKey, rawKey } });
  } catch (e) { next(e); }
}

export async function revokeApiKey(req: Request, res: Response, next: NextFunction) {
  try {
    await ApiKeyService.revoke(req.organizationId!, param(req.params.id), req.user!.sub);
    res.status(204).send();
  } catch (e) { next(e); }
}

// ─── Webhooks ─────────────────────────────────────────────────────────────────

export async function listWebhooks(req: Request, res: Response, next: NextFunction) {
  try {
    const hooks = await WebhookDispatcher.list(req.organizationId!);
    res.json({ status: 'ok', data: hooks });
  } catch (e) { next(e); }
}

export async function createWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    const hook = await WebhookDispatcher.create(req.organizationId!, req.user!.sub, req.body);
    res.status(201).json({ status: 'ok', data: hook });
  } catch (e) { next(e); }
}

export async function deleteWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    await WebhookDispatcher.delete(req.organizationId!, param(req.params.id));
    res.status(204).send();
  } catch (e) { next(e); }
}

export async function replayWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    await WebhookDispatcher.replay(req.organizationId!, param(req.params.id));
    res.json({ status: 'ok', message: 'Replay dispatched' });
  } catch (e) { next(e); }
}

// ─── Marketplace ──────────────────────────────────────────────────────────────

export async function listMarketplaceApps(req: Request, res: Response, next: NextFunction) {
  try {
    const apps = await MarketplaceService.listApps(req.query.category as string | undefined);
    res.json({ status: 'ok', data: apps });
  } catch (e) { next(e); }
}

export async function getMarketplaceApp(req: Request, res: Response, next: NextFunction) {
  try {
    const app = await MarketplaceService.getApp(param(req.params.slug));
    res.json({ status: 'ok', data: app });
  } catch (e) { next(e); }
}

export async function listInstalledApps(req: Request, res: Response, next: NextFunction) {
  try {
    const apps = await MarketplaceService.listInstalled(req.organizationId!);
    res.json({ status: 'ok', data: apps });
  } catch (e) { next(e); }
}

export async function installApp(req: Request, res: Response, next: NextFunction) {
  try {
    const { config } = req.body as { config?: Record<string, unknown> };
    const app = await MarketplaceService.install(req.organizationId!, req.user!.sub, param(req.params.slug), config);
    res.status(201).json({ status: 'ok', data: app });
  } catch (e) { next(e); }
}

export async function uninstallApp(req: Request, res: Response, next: NextFunction) {
  try {
    await MarketplaceService.uninstall(req.organizationId!, req.user!.sub, param(req.params.slug));
    res.status(204).send();
  } catch (e) { next(e); }
}

export async function updateAppConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const app = await MarketplaceService.updateConfig(req.organizationId!, param(req.params.slug), req.body);
    res.json({ status: 'ok', data: app });
  } catch (e) { next(e); }
}

// ─── Integrations ─────────────────────────────────────────────────────────────

export async function listIntegrations(req: Request, res: Response, next: NextFunction) {
  try {
    const integrations = await IntegrationService.list(req.organizationId!);
    res.json({ status: 'ok', data: integrations });
  } catch (e) { next(e); }
}

export async function connectIntegration(req: Request, res: Response, next: NextFunction) {
  try {
    const integration = await IntegrationService.connect(req.organizationId!, req.user!.sub, req.body);
    res.status(201).json({ status: 'ok', data: integration });
  } catch (e) { next(e); }
}

export async function disconnectIntegration(req: Request, res: Response, next: NextFunction) {
  try {
    await IntegrationService.disconnect(req.organizationId!, req.user!.sub, param(req.params.id));
    res.status(204).send();
  } catch (e) { next(e); }
}

export async function testIntegration(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await IntegrationService.testConnection(req.organizationId!, param(req.params.id));
    res.json({ status: 'ok', data: result });
  } catch (e) { next(e); }
}

// ─── White Label ──────────────────────────────────────────────────────────────

export async function getWhiteLabel(req: Request, res: Response, next: NextFunction) {
  try {
    const config = await WhiteLabelService.get(req.organizationId!);
    res.json({ status: 'ok', data: config });
  } catch (e) { next(e); }
}

export async function updateWhiteLabel(req: Request, res: Response, next: NextFunction) {
  try {
    const config = await WhiteLabelService.upsert(req.organizationId!, req.user!.sub, req.body);
    res.json({ status: 'ok', data: config });
  } catch (e) { next(e); }
}

export async function getPublicBranding(req: Request, res: Response, next: NextFunction) {
  try {
    // Public endpoint — resolved from org slug
    const slug = req.query.org as string ?? '';
    if (!slug) throw new ApiError(422, 'org parameter required', 'VALIDATION_ERROR');
    const { OrganizationModel } = require('../models/Organization.model');
    const org = await OrganizationModel.findOne({ $or: [{ slug }, { _id: slug }] }).lean();
    if (!org) throw new ApiError(404, 'Organization not found', 'NOT_FOUND');
    const branding = await WhiteLabelService.getPublic((org as any)._id.toString());
    res.json({ status: 'ok', data: branding });
  } catch (e) { next(e); }
}

// ─── SSO ──────────────────────────────────────────────────────────────────────

export async function listSsoConfigs(req: Request, res: Response, next: NextFunction) {
  try {
    const configs = await SsoService.list(req.organizationId!);
    res.json({ status: 'ok', data: configs });
  } catch (e) { next(e); }
}

export async function upsertSsoConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const config = await SsoService.upsert(req.organizationId!, req.user!.sub, req.body);
    res.json({ status: 'ok', data: config });
  } catch (e) { next(e); }
}

export async function testSsoConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await SsoService.test(req.organizationId!, param(req.params.provider));
    res.json({ status: 'ok', data: result });
  } catch (e) { next(e); }
}

export async function getSsoAuthUrl(req: Request, res: Response, next: NextFunction) {
  try {
    const provider    = param(req.params.provider);
    const redirectUri = String(req.query.redirectUri ?? `${req.protocol}://${req.get('host')}/api/v1/platform/sso/callback`);
    let url: string;
    if (provider === 'google')    url = SsoService.getGoogleSsoUrl(req.organizationId!, redirectUri);
    else if (provider === 'microsoft') url = SsoService.getMicrosoftSsoUrl(req.organizationId!, redirectUri);
    else throw new ApiError(400, 'Unsupported SSO provider', 'UNSUPPORTED_PROVIDER');
    res.json({ status: 'ok', data: { url } });
  } catch (e) { next(e); }
}

// ─── Compliance ───────────────────────────────────────────────────────────────

export async function listComplianceLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const logs = await ComplianceService.list(req.organizationId!, 100);
    res.json({ status: 'ok', data: logs });
  } catch (e) { next(e); }
}

export async function exportLeadData(req: Request, res: Response, next: NextFunction) {
  try {
    const { leadId } = req.body as { leadId: string };
    if (!leadId) throw new ApiError(422, 'leadId required', 'VALIDATION_ERROR');
    const data = await ComplianceService.exportLeadData(req.organizationId!, leadId);
    res.json({ status: 'ok', data });
  } catch (e) { next(e); }
}

export async function deleteLeadData(req: Request, res: Response, next: NextFunction) {
  try {
    const { leadId } = req.body as { leadId: string };
    if (!leadId) throw new ApiError(422, 'leadId required', 'VALIDATION_ERROR');
    const result = await ComplianceService.deleteLeadData(req.organizationId!, leadId, req.user!.sub);
    res.json({ status: 'ok', data: result });
  } catch (e) { next(e); }
}

export async function getRetentionReport(req: Request, res: Response, next: NextFunction) {
  try {
    const report = await ComplianceService.getRetentionReport(req.organizationId!);
    res.json({ status: 'ok', data: report });
  } catch (e) { next(e); }
}

// ─── Import / Export ──────────────────────────────────────────────────────────

export async function createImportJob(req: Request, res: Response, next: NextFunction) {
  try {
    const job = await ImportService.createJob(req.organizationId!, req.user!.sub, req.body);
    res.status(201).json({ status: 'ok', data: job });
  } catch (e) { next(e); }
}

export async function listImportJobs(req: Request, res: Response, next: NextFunction) {
  try {
    const jobs = await ImportService.listJobs(req.organizationId!);
    res.json({ status: 'ok', data: jobs });
  } catch (e) { next(e); }
}

export async function getImportJob(req: Request, res: Response, next: NextFunction) {
  try {
    const job = await ImportService.getJob(req.organizationId!, param(req.params.id));
    if (!job) throw new ApiError(404, 'Job not found', 'JOB_NOT_FOUND');
    res.json({ status: 'ok', data: job });
  } catch (e) { next(e); }
}

export async function createExportJob(req: Request, res: Response, next: NextFunction) {
  try {
    const entity   = String(req.query.entity ?? req.body.entity ?? 'leads') as any;
    const format   = String(req.query.format  ?? req.body.format  ?? 'csv');
    const { csv, filename } = await ExportService.export(req.organizationId!, entity);

    // Store job record
    await ImportExportJobModel.create({
      organizationId: req.organizationId!,
      type:           'export',
      entity,
      format,
      status:         'completed',
      successRows:    csv.split('\n').length - 1,
      totalRows:      csv.split('\n').length - 1,
      processedRows:  csv.split('\n').length - 1,
      startedAt:      new Date(), completedAt: new Date(),
      createdById:    req.user!.sub,
    }).catch(() => {});

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } else {
      res.json({ status: 'ok', data: csv });
    }
  } catch (e) { next(e); }
}

// ─── Developer ────────────────────────────────────────────────────────────────

export async function listDeveloperApps(req: Request, res: Response, next: NextFunction) {
  try {
    const apps = await DeveloperService.list(req.organizationId!);
    res.json({ status: 'ok', data: apps });
  } catch (e) { next(e); }
}

export async function createDeveloperApp(req: Request, res: Response, next: NextFunction) {
  try {
    const { app, clientSecret } = await DeveloperService.create(req.organizationId!, req.user!.sub, req.body);
    res.status(201).json({ status: 'ok', data: { ...app, clientSecret } });
  } catch (e) { next(e); }
}

export async function rotateDeveloperSecret(req: Request, res: Response, next: NextFunction) {
  try {
    const newSecret = await DeveloperService.rotateSecret(req.organizationId!, param(req.params.id));
    res.json({ status: 'ok', data: { clientSecret: newSecret } });
  } catch (e) { next(e); }
}

export async function deleteDeveloperApp(req: Request, res: Response, next: NextFunction) {
  try {
    await DeveloperService.delete(req.organizationId!, param(req.params.id));
    res.status(204).send();
  } catch (e) { next(e); }
}

export async function getApiDocs(_req: Request, res: Response, next: NextFunction) {
  try {
    const docs = DeveloperService.getApiDocsMeta();
    res.json({ status: 'ok', data: docs });
  } catch (e) { next(e); }
}

// ─── Platform Audit ───────────────────────────────────────────────────────────

export async function listPlatformAuditLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await PlatformAuditService.list(req.organizationId!, {
      event:   req.query.event as string,
      actorId: req.query.actorId as string,
      since:   req.query.since ? new Date(String(req.query.since)) : undefined,
      page:    Number(req.query.page  ?? 1),
      limit:   Number(req.query.limit ?? 30),
    });
    res.json({ status: 'ok', ...result });
  } catch (e) { next(e); }
}

export async function exportPlatformAuditLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const since = req.query.since ? new Date(String(req.query.since)) : undefined;
    const csv   = await PlatformAuditService.exportCsv(req.organizationId!, since);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="audit-log-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send(csv);
  } catch (e) { next(e); }
}
