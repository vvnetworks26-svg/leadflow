/**
 * WhiteLabelService.ts — White-label configuration CRUD + CSS sanitization.
 */

import { WhiteLabelConfigModel, IWhiteLabelConfig } from '../../models/WhiteLabelConfig.model';
import { sanitizeCss }                              from '../../widget/branding/CssSanitizer';
import { PlatformAuditLogModel }                    from '../../models/PlatformAuditLog.model';

export const WhiteLabelService = {

  async get(organizationId: string): Promise<IWhiteLabelConfig | null> {
    const doc = await WhiteLabelConfigModel.findOne({ organizationId });
    return doc ? (doc.toJSON() as unknown as IWhiteLabelConfig) : null;
  },

  async upsert(organizationId: string, userId: string, data: Partial<IWhiteLabelConfig>): Promise<IWhiteLabelConfig> {
    if (data.customCss) data.customCss = sanitizeCss(data.customCss);

    const doc = await WhiteLabelConfigModel.findOneAndUpdate(
      { organizationId },
      { $set: { ...data, organizationId } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    PlatformAuditLogModel.create({
      organizationId, event: 'white_label.updated', actorId: userId, actorType: 'user',
      resourceType: 'white_label', resourceId: organizationId,
      ipAddress: '', userAgent: '', before: {}, after: data, metadata: {},
    }).catch(() => {});

    return doc!.toJSON() as unknown as IWhiteLabelConfig;
  },

  /** Get white-label config for public consumption (no sensitive fields). */
  async getPublic(organizationId: string): Promise<Record<string, unknown>> {
    const config = await WhiteLabelService.get(organizationId);
    if (!config) return {};
    return {
      companyName:     config.companyName,
      logoUrl:         config.logoUrl,
      faviconUrl:      config.faviconUrl,
      primaryColor:    config.primaryColor,
      accentColor:     config.accentColor,
      backgroundColor: config.backgroundColor,
      fontFamily:      config.fontFamily,
      hidePoweredBy:   config.hidePoweredBy,
    };
  },
};
