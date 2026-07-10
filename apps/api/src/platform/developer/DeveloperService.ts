/**
 * DeveloperService.ts — Developer app registration, sandbox mode, usage analytics.
 */

import { randomBytes }           from 'crypto';
import { DeveloperAppModel, IDeveloperApp } from '../../models/DeveloperApp.model';
import { ApiError }              from '../../middleware/errorHandler';

export const DeveloperService = {

  async list(organizationId: string): Promise<IDeveloperApp[]> {
    const docs = await DeveloperAppModel.find({ organizationId, isActive: true }).sort({ createdAt: -1 });
    return docs.map(d => d.toJSON() as unknown as IDeveloperApp);
  },

  async getById(organizationId: string, id: string): Promise<IDeveloperApp> {
    const doc = await DeveloperAppModel.findOne({ _id: id, organizationId });
    if (!doc) throw new ApiError(404, 'Developer app not found', 'APP_NOT_FOUND');
    return doc.toJSON() as unknown as IDeveloperApp;
  },

  async create(organizationId: string, userId: string, data: {
    name:         string;
    description?: string;
    redirectUris: string[];
    scopes:       string[];
    webhookUrl?:  string;
    isSandbox?:   boolean;
  }): Promise<{ app: IDeveloperApp; clientSecret: string }> {
    const clientId     = 'lf_app_' + randomBytes(16).toString('hex');
    const clientSecret = randomBytes(32).toString('hex');

    const doc = await DeveloperAppModel.create({
      organizationId,
      name:         data.name,
      description:  data.description ?? '',
      clientId,
      clientSecret,
      redirectUris: data.redirectUris,
      scopes:       data.scopes,
      webhookUrl:   data.webhookUrl ?? '',
      isSandbox:    data.isSandbox  ?? false,
      isActive:     true,
      createdById:  userId,
    });

    return { app: doc.toJSON() as unknown as IDeveloperApp, clientSecret };
  },

  async update(organizationId: string, id: string, data: Partial<IDeveloperApp>): Promise<IDeveloperApp> {
    const doc = await DeveloperAppModel.findOneAndUpdate(
      { _id: id, organizationId }, data, { new: true }
    );
    if (!doc) throw new ApiError(404, 'Developer app not found', 'APP_NOT_FOUND');
    return doc.toJSON() as unknown as IDeveloperApp;
  },

  async delete(organizationId: string, id: string): Promise<void> {
    await DeveloperAppModel.findOneAndUpdate({ _id: id, organizationId }, { isActive: false });
  },

  /** Rotate the client secret — returns new secret once. */
  async rotateSecret(organizationId: string, id: string): Promise<string> {
    const newSecret = randomBytes(32).toString('hex');
    const doc = await DeveloperAppModel.findOneAndUpdate(
      { _id: id, organizationId }, { clientSecret: newSecret }
    );
    if (!doc) throw new ApiError(404, 'Developer app not found', 'APP_NOT_FOUND');
    return newSecret;
  },

  /** Return API documentation metadata (used by developer portal). */
  getApiDocsMeta(): Record<string, unknown> {
    return {
      version:    '1.0',
      baseUrl:    '/api/v1',
      authMethod: 'Bearer JWT or API Key (X-LeadFlow-Key header)',
      endpoints: [
        { method: 'GET',  path: '/leads',         description: 'List leads',          scopes: ['leads:read'] },
        { method: 'POST', path: '/leads',          description: 'Create lead',         scopes: ['leads:write'] },
        { method: 'GET',  path: '/bookings',       description: 'List bookings',       scopes: ['bookings:read'] },
        { method: 'POST', path: '/bookings',       description: 'Create booking',      scopes: ['bookings:write'] },
        { method: 'GET',  path: '/conversations',  description: 'List conversations',  scopes: ['conversations:read'] },
        { method: 'POST', path: '/comms/messages', description: 'Send message',        scopes: ['conversations:write'] },
        { method: 'GET',  path: '/dashboard',      description: 'Dashboard metrics',   scopes: ['analytics:read'] },
        { method: 'POST', path: '/agents/:id/chat',description: 'Chat with AI agent',  scopes: ['agents:write'] },
      ],
      rateLimits: {
        default:     '200 requests / 15 minutes per IP',
        apiKey:      'Configurable per key (0 = unlimited)',
        auth:        '10 requests / 15 minutes',
      },
      webhookEvents: [
        'lead.created', 'lead.updated', 'lead.won', 'lead.lost',
        'booking.created', 'booking.cancelled', 'booking.completed',
        'workflow.completed', 'campaign.completed', 'agent.session.completed',
      ],
    };
  },
};
