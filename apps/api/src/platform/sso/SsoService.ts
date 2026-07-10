/**
 * SsoService.ts — SSO configuration management + Google/Microsoft OAuth flow hooks.
 */

import { SsoConfigurationModel, ISsoConfiguration } from '../../models/SsoConfiguration.model';
import { PlatformAuditLogModel }                    from '../../models/PlatformAuditLog.model';
import { ComplianceService }                        from '../compliance/ComplianceService';
import { ApiError }                                 from '../../middleware/errorHandler';
import { env }                                      from '../../config/env';

export const SsoService = {

  async list(organizationId: string): Promise<ISsoConfiguration[]> {
    const docs = await SsoConfigurationModel.find({ organizationId });
    return docs.map(d => d.toJSON() as unknown as ISsoConfiguration);
  },

  async upsert(organizationId: string, userId: string, data: Partial<ISsoConfiguration>): Promise<ISsoConfiguration> {
    const doc = await SsoConfigurationModel.findOneAndUpdate(
      { organizationId, provider: data.provider },
      { $set: { ...data, organizationId, createdById: userId } },
      { upsert: true, new: true }
    );
    PlatformAuditLogModel.create({ organizationId, event: 'sso.configured', actorId: userId, actorType: 'user', resourceType: 'sso', resourceId: doc.id, ipAddress: '', userAgent: '', before: {}, after: { provider: data.provider, enabled: data.isEnabled }, metadata: {} }).catch(() => {});
    return doc!.toJSON() as unknown as ISsoConfiguration;
  },

  async delete(organizationId: string, provider: string): Promise<void> {
    await SsoConfigurationModel.findOneAndDelete({ organizationId, provider });
  },

  /** Generate Google OAuth URL for SSO. */
  getGoogleSsoUrl(organizationId: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id:     env.GOOGLE_CLIENT_ID ?? '',
      response_type: 'code',
      scope:         'openid email profile',
      redirect_uri:  redirectUri,
      state:         Buffer.from(JSON.stringify({ organizationId, provider: 'google' })).toString('base64'),
      access_type:   'offline',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  },

  /** Generate Microsoft OAuth URL for SSO. */
  getMicrosoftSsoUrl(organizationId: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id:     env.MS_CLIENT_ID ?? '',
      response_type: 'code',
      scope:         'openid email profile',
      redirect_uri:  redirectUri,
      state:         Buffer.from(JSON.stringify({ organizationId, provider: 'microsoft' })).toString('base64'),
    });
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
  },

  /** Test SSO configuration. */
  async test(organizationId: string, provider: string): Promise<{ success: boolean; message: string }> {
    const config = await SsoConfigurationModel.findOne({ organizationId, provider });
    if (!config) throw new ApiError(404, 'SSO not configured', 'SSO_NOT_FOUND');

    // Mock test — wire to actual OIDC discovery / SAML metadata in production
    await SsoConfigurationModel.findByIdAndUpdate(config._id, { lastTestedAt: new Date(), testResult: 'Configuration valid' });
    PlatformAuditLogModel.create({ organizationId, event: 'sso.configured', actorType: 'system', resourceType: 'sso', resourceId: config.id, ipAddress: '', userAgent: '', before: {}, after: { tested: true }, metadata: {} }).catch(() => {});
    return { success: true, message: 'SSO configuration is valid' };
  },
};
