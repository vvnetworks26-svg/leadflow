/**
 * MarketplaceService.ts — App catalog, install, uninstall, update.
 */

import { MarketplaceAppModel, AppInstallationModel, IMarketplaceApp, IAppInstallation } from '../../models/MarketplaceApp.model';
import { PlatformAuditLogModel } from '../../models/PlatformAuditLog.model';
import { ApiError }              from '../../middleware/errorHandler';

// ─── System apps seeded at startup ───────────────────────────────────────────

const SYSTEM_APPS: Omit<IMarketplaceApp, 'id' | 'createdAt' | 'updatedAt' | 'installCount'>[] = [
  { slug: 'google-calendar',    name: 'Google Calendar',    category: 'calendar',       version: '1.0.0', status: 'active', developer: 'Google',     iconUrl: '', screenshotUrls: [], isSystem: true, description: 'Sync bookings with Google Calendar', permissions: ['calendar:read','calendar:write'], dependencies: [], configSchema: {} },
  { slug: 'microsoft-365',      name: 'Microsoft 365',      category: 'calendar',       version: '1.0.0', status: 'active', developer: 'Microsoft',  iconUrl: '', screenshotUrls: [], isSystem: true, description: 'Sync with Outlook Calendar', permissions: ['calendar:read','calendar:write'], dependencies: [], configSchema: {} },
  { slug: 'slack',              name: 'Slack',              category: 'communication',  version: '1.0.0', status: 'active', developer: 'Slack',      iconUrl: '', screenshotUrls: [], isSystem: true, description: 'Send notifications to Slack', permissions: ['notifications:write'], dependencies: [], configSchema: { webhookUrl: { type: 'string', required: true } } },
  { slug: 'zapier',             name: 'Zapier',             category: 'automation',     version: '1.0.0', status: 'active', developer: 'Zapier',     iconUrl: '', screenshotUrls: [], isSystem: true, description: 'Connect 5,000+ apps with Zapier', permissions: ['webhooks:manage'], dependencies: [], configSchema: {} },
  { slug: 'hubspot',            name: 'HubSpot',            category: 'crm',            version: '1.0.0', status: 'active', developer: 'HubSpot',    iconUrl: '', screenshotUrls: [], isSystem: true, description: 'Two-way CRM sync with HubSpot', permissions: ['leads:read','leads:write'], dependencies: [], configSchema: { apiKey: { type: 'string', required: true } } },
  { slug: 'salesforce',         name: 'Salesforce',         category: 'crm',            version: '1.0.0', status: 'beta',   developer: 'Salesforce', iconUrl: '', screenshotUrls: [], isSystem: true, description: 'Sync leads and opportunities with Salesforce', permissions: ['leads:read','leads:write'], dependencies: [], configSchema: {} },
  { slug: 'quickbooks',         name: 'QuickBooks',         category: 'billing',        version: '1.0.0', status: 'beta',   developer: 'Intuit',     iconUrl: '', screenshotUrls: [], isSystem: true, description: 'Sync invoices with QuickBooks', permissions: ['billing:read','billing:write'], dependencies: [], configSchema: {} },
  { slug: 'zoom',               name: 'Zoom',               category: 'communication',  version: '1.0.0', status: 'active', developer: 'Zoom',       iconUrl: '', screenshotUrls: [], isSystem: true, description: 'Auto-create Zoom meetings for bookings', permissions: ['bookings:write'], dependencies: [], configSchema: { apiKey: { type: 'string', required: true } } },
];

export const MarketplaceService = {

  async listApps(category?: string): Promise<IMarketplaceApp[]> {
    const filter: Record<string, unknown> = { status: { $ne: 'deprecated' } };
    if (category) filter.category = category;
    const docs = await MarketplaceAppModel.find(filter).sort({ name: 1 });
    return docs.map(d => d.toJSON() as unknown as IMarketplaceApp);
  },

  async getApp(slug: string): Promise<IMarketplaceApp> {
    const doc = await MarketplaceAppModel.findOne({ slug });
    if (!doc) throw new ApiError(404, 'App not found', 'APP_NOT_FOUND');
    return doc.toJSON() as unknown as IMarketplaceApp;
  },

  async listInstalled(organizationId: string): Promise<IAppInstallation[]> {
    const docs = await AppInstallationModel.find({ organizationId, status: { $ne: 'disabled' } }).sort({ installedAt: -1 });
    return docs.map(d => d.toJSON() as unknown as IAppInstallation);
  },

  async install(organizationId: string, userId: string, appSlug: string, config: Record<string, unknown> = {}): Promise<IAppInstallation> {
    const app = await MarketplaceAppModel.findOne({ slug: appSlug });
    if (!app) throw new ApiError(404, 'App not found', 'APP_NOT_FOUND');
    if (app.status === 'deprecated') throw new ApiError(400, 'App is deprecated', 'APP_DEPRECATED');

    const existing = await AppInstallationModel.findOne({ organizationId, appSlug });
    if (existing && existing.status === 'installed') throw new ApiError(409, 'App already installed', 'ALREADY_INSTALLED');

    const doc = await AppInstallationModel.findOneAndUpdate(
      { organizationId, appSlug },
      { appId: app.id, appSlug, version: app.version, status: 'installed', config, installedById: userId, installedAt: new Date() },
      { upsert: true, new: true }
    );

    await MarketplaceAppModel.findByIdAndUpdate(app._id, { $inc: { installCount: 1 } });
    PlatformAuditLogModel.create({ organizationId, event: 'app.installed', actorId: userId, actorType: 'user', resourceType: 'app', resourceId: app.id, ipAddress: '', userAgent: '', before: {}, after: { appSlug, version: app.version }, metadata: {} }).catch(() => {});

    return doc.toJSON() as unknown as IAppInstallation;
  },

  async uninstall(organizationId: string, userId: string, appSlug: string): Promise<void> {
    const doc = await AppInstallationModel.findOneAndUpdate(
      { organizationId, appSlug }, { status: 'disabled' }
    );
    if (!doc) throw new ApiError(404, 'App not installed', 'NOT_INSTALLED');
    PlatformAuditLogModel.create({ organizationId, event: 'app.uninstalled', actorId: userId, actorType: 'user', resourceType: 'app', resourceId: appSlug, ipAddress: '', userAgent: '', before: {}, after: {}, metadata: {} }).catch(() => {});
  },

  async updateConfig(organizationId: string, appSlug: string, config: Record<string, unknown>): Promise<IAppInstallation> {
    const doc = await AppInstallationModel.findOneAndUpdate(
      { organizationId, appSlug, status: 'installed' }, { config }, { new: true }
    );
    if (!doc) throw new ApiError(404, 'App not installed', 'NOT_INSTALLED');
    return doc.toJSON() as unknown as IAppInstallation;
  },

  async seedSystemApps(): Promise<void> {
    const existing = await MarketplaceAppModel.countDocuments({ isSystem: true });
    if (existing >= SYSTEM_APPS.length) return;
    for (const app of SYSTEM_APPS) {
      await MarketplaceAppModel.findOneAndUpdate({ slug: app.slug }, { $setOnInsert: app }, { upsert: true });
    }
  },
};
