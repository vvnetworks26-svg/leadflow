/**
 * MarketplaceApp.model.ts — App catalog + installation records.
 */

import { Schema, model, Document } from 'mongoose';

export type AppCategory = 'crm' | 'calendar' | 'communication' | 'analytics' | 'automation' | 'billing' | 'ai' | 'productivity' | 'security' | 'developer' | 'other';
export type AppStatus   = 'active' | 'beta' | 'deprecated';

export interface IMarketplaceApp {
  id:          string;
  slug:        string;
  name:        string;
  description: string;
  category:    AppCategory;
  version:     string;
  status:      AppStatus;
  developer:   string;
  iconUrl:     string;
  screenshotUrls: string[];
  permissions: string[];
  dependencies:string[];
  configSchema:Record<string, unknown>;
  isSystem:    boolean;
  installCount:number;
  createdAt:   Date;
  updatedAt:   Date;
}

export interface IAppInstallation {
  id:             string;
  organizationId: string;
  appId:          string;
  appSlug:        string;
  version:        string;
  status:         'installed' | 'disabled' | 'updating' | 'error';
  config:         Record<string, unknown>;
  installedById:  string;
  installedAt:    Date;
  updatedAt:      Date;
}

export interface MarketplaceAppDocument extends Omit<IMarketplaceApp, 'id'>, Document {}
export interface AppInstallationDocument extends Omit<IAppInstallation, 'id'>, Document {}

const MarketplaceAppSchema = new Schema<MarketplaceAppDocument>(
  {
    slug:            { type: String, required: true, unique: true },
    name:            { type: String, required: true },
    description:     { type: String, default: '' },
    category:        { type: String, default: 'other' },
    version:         { type: String, required: true },
    status:          { type: String, enum: ['active','beta','deprecated'], default: 'active' },
    developer:       { type: String, default: 'LeadFlow' },
    iconUrl:         { type: String, default: '' },
    screenshotUrls:  { type: [String], default: [] },
    permissions:     { type: [String], default: [] },
    dependencies:    { type: [String], default: [] },
    configSchema:    { type: Schema.Types.Mixed, default: {} },
    isSystem:        { type: Boolean, default: false },
    installCount:    { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false, toJSON: { virtuals: true, transform: (_doc, ret) => { ret.id = ret._id.toString(); delete (ret as any)._id; return ret; } } }
);

const AppInstallationSchema = new Schema<AppInstallationDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    appId:          { type: String, required: true },
    appSlug:        { type: String, required: true },
    version:        { type: String, required: true },
    status:         { type: String, enum: ['installed','disabled','updating','error'], default: 'installed' },
    config:         { type: Schema.Types.Mixed, default: {} },
    installedById:  { type: String, required: true },
    installedAt:    { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: false, updatedAt: true }, versionKey: false, toJSON: { virtuals: true, transform: (_doc, ret) => { ret.id = ret._id.toString(); delete (ret as any)._id; return ret; } } }
);

AppInstallationSchema.index({ organizationId: 1, appSlug: 1 }, { unique: true });

export const MarketplaceAppModel    = model<MarketplaceAppDocument>('MarketplaceApp', MarketplaceAppSchema);
export const AppInstallationModel   = model<AppInstallationDocument>('AppInstallation', AppInstallationSchema);
