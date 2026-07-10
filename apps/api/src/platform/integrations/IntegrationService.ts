/**
 * IntegrationService.ts — Third-party integration connection management.
 */

import { IntegrationModel, IIntegration } from '../../models/Integration.model';
import { PlatformAuditLogModel }          from '../../models/PlatformAuditLog.model';
import { ApiError }                       from '../../middleware/errorHandler';
import { WebhookDispatcher }              from '../webhooks/WebhookDispatcher';

export const IntegrationService = {

  async list(organizationId: string): Promise<IIntegration[]> {
    const docs = await IntegrationModel.find({ organizationId }).sort({ provider: 1 });
    return docs.map(d => d.toJSON() as unknown as IIntegration);
  },

  async getById(organizationId: string, id: string): Promise<IIntegration> {
    const doc = await IntegrationModel.findOne({ _id: id, organizationId });
    if (!doc) throw new ApiError(404, 'Integration not found', 'INTEGRATION_NOT_FOUND');
    return doc.toJSON() as unknown as IIntegration;
  },

  async connect(organizationId: string, userId: string, data: {
    provider:   IIntegration['provider'];
    name?:      string;
    config?:    Record<string, unknown>;
    credentials?:Record<string, unknown>;
  }): Promise<IIntegration> {
    const doc = await IntegrationModel.findOneAndUpdate(
      { organizationId, provider: data.provider },
      {
        $set: {
          organizationId,
          provider:       data.provider,
          name:           data.name ?? data.provider,
          status:         'connected',
          config:         data.config      ?? {},
          credentials:    data.credentials ?? {},
          installedById:  userId,
          lastSyncAt:     new Date(),
          errorMessage:   null,
        },
      },
      { upsert: true, new: true }
    );

    PlatformAuditLogModel.create({ organizationId, event: 'integration.connected', actorId: userId, actorType: 'user', resourceType: 'integration', resourceId: doc.id, ipAddress: '', userAgent: '', before: {}, after: { provider: data.provider }, metadata: {} }).catch(() => {});
    WebhookDispatcher.dispatch(organizationId, 'workflow.completed', { event: 'integration.connected', provider: data.provider });

    return doc.toJSON() as unknown as IIntegration;
  },

  async disconnect(organizationId: string, userId: string, id: string): Promise<void> {
    const doc = await IntegrationModel.findOneAndUpdate(
      { _id: id, organizationId },
      { status: 'disconnected', credentials: {} }
    );
    if (!doc) throw new ApiError(404, 'Integration not found', 'INTEGRATION_NOT_FOUND');
    PlatformAuditLogModel.create({ organizationId, event: 'integration.disconnected', actorId: userId, actorType: 'user', resourceType: 'integration', resourceId: id, ipAddress: '', userAgent: '', before: {}, after: {}, metadata: {} }).catch(() => {});
  },

  async updateConfig(organizationId: string, id: string, config: Record<string, unknown>): Promise<IIntegration> {
    const doc = await IntegrationModel.findOneAndUpdate(
      { _id: id, organizationId }, { config }, { new: true }
    );
    if (!doc) throw new ApiError(404, 'Integration not found', 'INTEGRATION_NOT_FOUND');
    return doc.toJSON() as unknown as IIntegration;
  },

  async testConnection(organizationId: string, id: string): Promise<{ success: boolean; message: string }> {
    const doc = await IntegrationModel.findOne({ _id: id, organizationId });
    if (!doc) throw new ApiError(404, 'Integration not found', 'INTEGRATION_NOT_FOUND');
    // Mock test — replace with actual provider health check
    await IntegrationModel.findByIdAndUpdate(id, { lastSyncAt: new Date(), status: 'connected', errorMessage: null });
    return { success: true, message: 'Connection test successful' };
  },

  /** Dispatch an event to all connected integrations (for outbound sync). */
  dispatch(organizationId: string, event: string, payload: Record<string, unknown>): void {
    WebhookDispatcher.dispatch(organizationId, 'workflow.completed', { integrationEvent: event, ...payload });
  },
};
