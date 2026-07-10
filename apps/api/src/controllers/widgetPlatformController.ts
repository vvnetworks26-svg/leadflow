/**
 * widgetPlatformController.ts
 *
 * All white-label widget platform API handlers.
 * Every route reads organizationId from req.organizationId.
 */

import { Request, Response, NextFunction } from 'express';
import { param }                    from '../utils/params';
import { ApiError }                 from '../middleware/errorHandler';

import { WidgetConfigService }      from '../widget/branding/WidgetConfigService';
import { ThemeService }             from '../widget/themes/ThemeService';
import { DeploymentService }        from '../widget/versioning/DeploymentService';
import { LocalizationService }      from '../widget/localization/LocalizationService';
import { generateSnippet, getAllSnippets } from '../widget/deployment/SnippetGenerator';
import { WidgetAnalyticsService }   from '../widget/analytics/WidgetAnalyticsService';
import { ABTestService }            from '../widget/abtest/ABTestService';
import { AssetService }             from '../widget/assets/AssetService';
import { PreviewService }           from '../widget/preview/PreviewService';
import { OrganizationModel }        from '../models/Organization.model';

// ─── Configuration ────────────────────────────────────────────────────────────

export async function getWidgetConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const config = await WidgetConfigService.get(req.organizationId!);
    res.json({ status: 'ok', data: config });
  } catch (e) { next(e); }
}

export async function updateWidgetConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const config = await WidgetConfigService.update(req.organizationId!, req.body);
    res.json({ status: 'ok', data: config });
  } catch (e) { next(e); }
}

export async function applyThemeToConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const { themeId } = req.body as { themeId: string };
    if (!themeId) throw new ApiError(422, 'themeId is required', 'VALIDATION_ERROR');
    const config = await WidgetConfigService.applyTheme(req.organizationId!, themeId);
    res.json({ status: 'ok', data: config });
  } catch (e) { next(e); }
}

export async function publishWidget(req: Request, res: Response, next: NextFunction) {
  try {
    const { changeNotes } = req.body as { changeNotes?: string };
    const config = await WidgetConfigService.publish(req.organizationId!, req.user!.sub, changeNotes);
    res.json({ status: 'ok', data: config });
  } catch (e) { next(e); }
}

export async function getPublishedConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const snapshot = await WidgetConfigService.getPublishedSnapshot(req.organizationId!);
    res.json({ status: 'ok', data: snapshot });
  } catch (e) { next(e); }
}

// ─── Themes ───────────────────────────────────────────────────────────────────

export async function listThemes(req: Request, res: Response, next: NextFunction) {
  try {
    const themes = await ThemeService.listAll(req.organizationId!);
    res.json({ status: 'ok', data: themes });
  } catch (e) { next(e); }
}

export async function duplicateTheme(req: Request, res: Response, next: NextFunction) {
  try {
    const { name } = req.body as { name: string };
    if (!name) throw new ApiError(422, 'name is required', 'VALIDATION_ERROR');
    const theme = await ThemeService.duplicate(param(req.params.id), req.organizationId!, name);
    res.status(201).json({ status: 'ok', data: theme });
  } catch (e) { next(e); }
}

export async function updateTheme(req: Request, res: Response, next: NextFunction) {
  try {
    const theme = await ThemeService.update(req.organizationId!, param(req.params.id), req.body);
    res.json({ status: 'ok', data: theme });
  } catch (e) { next(e); }
}

export async function deleteTheme(req: Request, res: Response, next: NextFunction) {
  try {
    await ThemeService.delete(req.organizationId!, param(req.params.id));
    res.status(204).send();
  } catch (e) { next(e); }
}

// ─── Deployments / Versioning ─────────────────────────────────────────────────

export async function listDeployments(req: Request, res: Response, next: NextFunction) {
  try {
    const page   = Number(req.query.page  ?? 1);
    const limit  = Number(req.query.limit ?? 20);
    const result = await DeploymentService.list(req.organizationId!, page, limit);
    res.json({ status: 'ok', ...result });
  } catch (e) { next(e); }
}

export async function getDeployment(req: Request, res: Response, next: NextFunction) {
  try {
    const dep = await DeploymentService.getById(req.organizationId!, param(req.params.id));
    res.json({ status: 'ok', data: dep });
  } catch (e) { next(e); }
}

export async function rollbackDeployment(req: Request, res: Response, next: NextFunction) {
  try {
    const dep = await DeploymentService.rollback(req.organizationId!, param(req.params.id), req.user!.sub);
    res.json({ status: 'ok', data: dep });
  } catch (e) { next(e); }
}

export async function diffDeployments(req: Request, res: Response, next: NextFunction) {
  try {
    const { fromId, toId } = req.query as { fromId: string; toId: string };
    if (!fromId || !toId) throw new ApiError(422, 'fromId and toId required', 'VALIDATION_ERROR');
    const [a, b] = await Promise.all([
      DeploymentService.getById(req.organizationId!, fromId),
      DeploymentService.getById(req.organizationId!, toId),
    ]);
    const diff = DeploymentService.diff(
      a.configSnapshot as Record<string, unknown>,
      b.configSnapshot as Record<string, unknown>
    );
    res.json({ status: 'ok', data: diff });
  } catch (e) { next(e); }
}

// ─── Localization ─────────────────────────────────────────────────────────────

export async function listLocalizations(req: Request, res: Response, next: NextFunction) {
  try {
    const locs = await LocalizationService.list(req.organizationId!);
    res.json({ status: 'ok', data: locs });
  } catch (e) { next(e); }
}

export async function upsertLocalization(req: Request, res: Response, next: NextFunction) {
  try {
    const { localeCode, strings } = req.body as { localeCode: string; strings: Record<string, string> };
    if (!localeCode) throw new ApiError(422, 'localeCode is required', 'VALIDATION_ERROR');
    const loc = await LocalizationService.upsert(req.organizationId!, localeCode, strings ?? {});
    res.json({ status: 'ok', data: loc });
  } catch (e) { next(e); }
}

export async function deleteLocalization(req: Request, res: Response, next: NextFunction) {
  try {
    await LocalizationService.delete(req.organizationId!, param(req.params.localeCode));
    res.status(204).send();
  } catch (e) { next(e); }
}

export async function getSupportedLocales(_req: Request, res: Response, next: NextFunction) {
  try {
    const locales = LocalizationService.getSupportedLocales();
    res.json({ status: 'ok', data: locales });
  } catch (e) { next(e); }
}

// ─── Deployment Snippets ─────────────────────────────────────────────────────

export async function getInstallSnippets(req: Request, res: Response, next: NextFunction) {
  try {
    const org  = await OrganizationModel.findById(req.organizationId!).lean();
    const slug = (org as any)?.slug ?? req.organizationId!;
    const snippets = getAllSnippets({ organizationSlug: slug });
    res.json({ status: 'ok', data: snippets });
  } catch (e) { next(e); }
}

export async function getInstallSnippet(req: Request, res: Response, next: NextFunction) {
  try {
    const org      = await OrganizationModel.findById(req.organizationId!).lean();
    const slug     = (org as any)?.slug ?? req.organizationId!;
    const platform = param(req.params.platform) as any;
    const snippet  = generateSnippet(platform, { organizationSlug: slug });
    res.json({ status: 'ok', data: { platform, snippet } });
  } catch (e) { next(e); }
}

// ─── Preview ──────────────────────────────────────────────────────────────────

export async function getPreview(req: Request, res: Response, next: NextFunction) {
  try {
    const device    = (req.query.device as any) ?? 'desktop';
    const overrides = req.body?.overrides ?? undefined;
    const preview   = await PreviewService.generate(req.organizationId!, device, overrides);
    res.json({ status: 'ok', data: preview });
  } catch (e) { next(e); }
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export async function trackWidgetEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const { eventType, sessionId, ...rest } = req.body;
    if (!eventType || !sessionId) throw new ApiError(422, 'eventType and sessionId required', 'VALIDATION_ERROR');
    WidgetAnalyticsService.track({ ...rest, organizationId: req.organizationId!, eventType, sessionId });
    res.json({ status: 'ok' });
  } catch (e) { next(e); }
}

export async function getWidgetAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const since = req.query.since ? new Date(String(req.query.since)) : undefined;
    const stats  = await WidgetAnalyticsService.getStats(req.organizationId!, since);
    res.json({ status: 'ok', data: stats });
  } catch (e) { next(e); }
}

// ─── A/B Tests ────────────────────────────────────────────────────────────────

export async function listABTests(req: Request, res: Response, next: NextFunction) {
  try {
    const tests = await ABTestService.list(req.organizationId!);
    res.json({ status: 'ok', data: tests });
  } catch (e) { next(e); }
}

export async function createABTest(req: Request, res: Response, next: NextFunction) {
  try {
    const test = await ABTestService.create(req.organizationId!, req.body);
    res.status(201).json({ status: 'ok', data: test });
  } catch (e) { next(e); }
}

export async function startABTest(req: Request, res: Response, next: NextFunction) {
  try {
    const test = await ABTestService.start(req.organizationId!, param(req.params.id));
    res.json({ status: 'ok', data: test });
  } catch (e) { next(e); }
}

export async function pauseABTest(req: Request, res: Response, next: NextFunction) {
  try {
    const test = await ABTestService.pause(req.organizationId!, param(req.params.id));
    res.json({ status: 'ok', data: test });
  } catch (e) { next(e); }
}

export async function promoteABWinner(req: Request, res: Response, next: NextFunction) {
  try {
    const test = await ABTestService.checkAndPromoteWinner(req.organizationId!, param(req.params.id), req.user!.sub);
    res.json({ status: 'ok', data: test });
  } catch (e) { next(e); }
}

export async function deleteABTest(req: Request, res: Response, next: NextFunction) {
  try {
    await ABTestService.delete(req.organizationId!, param(req.params.id));
    res.status(204).send();
  } catch (e) { next(e); }
}

// ─── Assets ───────────────────────────────────────────────────────────────────

export async function listAssets(req: Request, res: Response, next: NextFunction) {
  try {
    const type   = req.query.type as any;
    const assets = await AssetService.list(req.organizationId!, type);
    res.json({ status: 'ok', data: assets });
  } catch (e) { next(e); }
}

export async function registerAsset(req: Request, res: Response, next: NextFunction) {
  try {
    const asset = await AssetService.register(req.organizationId!, req.user!.sub, req.body);
    res.status(201).json({ status: 'ok', data: asset });
  } catch (e) { next(e); }
}

export async function deleteAsset(req: Request, res: Response, next: NextFunction) {
  try {
    await AssetService.delete(req.organizationId!, param(req.params.id));
    res.status(204).send();
  } catch (e) { next(e); }
}

export async function getAssetAllowedTypes(_req: Request, res: Response, next: NextFunction) {
  try {
    const allowed = AssetService.getAllowedMimeTypes();
    res.json({ status: 'ok', data: allowed });
  } catch (e) { next(e); }
}
