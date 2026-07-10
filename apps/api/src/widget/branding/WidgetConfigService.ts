/**
 * WidgetConfigService.ts
 *
 * Core widget configuration CRUD.
 * One config per organization — upsert pattern.
 * Sanitizes CSS before saving. Applies theme when themeId is set.
 */

import { WidgetConfigurationModel, IWidgetConfiguration } from '../../models/WidgetConfiguration.model';
import { WidgetDeploymentModel }  from '../../models/WidgetDeployment.model';
import { ThemeService }           from '../themes/ThemeService';
import { sanitizeCss }            from './CssSanitizer';
import { ApiError }               from '../../middleware/errorHandler';

export const WidgetConfigService = {

  async get(organizationId: string): Promise<IWidgetConfiguration> {
    let doc = await WidgetConfigurationModel.findOne({ organizationId });
    if (!doc) {
      doc = await WidgetConfigurationModel.create({ organizationId });
    }
    return doc.toJSON() as unknown as IWidgetConfiguration;
  },

  async update(organizationId: string, patch: Partial<IWidgetConfiguration>): Promise<IWidgetConfiguration> {
    // Sanitize CSS if provided
    if (patch.customCss) {
      patch.customCss = sanitizeCss(patch.customCss);
    }
    // Never store raw scripts
    if ('customScript' in patch) {
      delete (patch as any).customScript;
    }

    const doc = await WidgetConfigurationModel.findOneAndUpdate(
      { organizationId },
      { $set: { ...patch, organizationId } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return doc!.toJSON() as unknown as IWidgetConfiguration;
  },

  /** Apply a theme's colors/typography/etc. to the widget config. */
  async applyTheme(organizationId: string, themeId: string): Promise<IWidgetConfiguration> {
    const theme = await ThemeService.getById(themeId);
    return WidgetConfigService.update(organizationId, {
      themeId,
      colors:       theme.colors as any,
      typography:   theme.typography as any,
      borderRadius: theme.borderRadius,
      buttonStyle:  theme.buttonStyle,
      shadowStyle:  theme.shadowStyle,
    });
  },

  /** Publish the current draft config as a new deployment version. */
  async publish(organizationId: string, userId: string, changeNotes = ''): Promise<IWidgetConfiguration> {
    const config = await WidgetConfigService.get(organizationId);

    // Archive previous published deployment
    await WidgetDeploymentModel.updateMany(
      { organizationId, status: 'published' },
      { status: 'archived', archivedAt: new Date() }
    );

    const nextVersion = config.draftVersion;

    await WidgetDeploymentModel.create({
      organizationId,
      name:           `Version ${nextVersion}`,
      status:         'published',
      version:        nextVersion,
      configSnapshot: config as unknown as Record<string, unknown>,
      publishedAt:    new Date(),
      publishedById:  userId,
      changeNotes,
    });

    const updated = await WidgetConfigurationModel.findOneAndUpdate(
      { organizationId },
      { publishedVersion: nextVersion, draftVersion: nextVersion + 1 },
      { new: true }
    );
    return updated!.toJSON() as unknown as IWidgetConfiguration;
  },

  /** Get the currently published config snapshot (used by the widget SDK). */
  async getPublishedSnapshot(organizationId: string): Promise<Record<string, unknown> | null> {
    const deployment = await WidgetDeploymentModel.findOne(
      { organizationId, status: 'published' },
      {},
      { sort: { version: -1 } }
    ).lean();
    return deployment ? (deployment.configSnapshot as Record<string, unknown>) : null;
  },
};
