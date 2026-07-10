/**
 * WhiteLabelConfig.model.ts — Per-org white-label and brand configuration.
 */

import { Schema, model, Document } from 'mongoose';

export interface IWhiteLabelConfig {
  id:             string;
  organizationId: string;
  companyName:    string;
  domain:         string;       // custom domain e.g. app.acme.com
  logoUrl:        string;
  faviconUrl:     string;
  emailFromName:  string;
  emailFromAddress:string;
  emailLogoUrl:   string;
  primaryColor:   string;
  accentColor:    string;
  backgroundColor:string;
  fontFamily:     string;
  supportEmail:   string;
  supportUrl:     string;
  privacyUrl:     string;
  termsUrl:       string;
  hidePoweredBy:  boolean;
  customCss:      string;       // sanitized
  ssoEnabled:     boolean;
  createdAt:      Date;
  updatedAt:      Date;
}

export interface WhiteLabelConfigDocument extends Omit<IWhiteLabelConfig, 'id'>, Document {}

const WhiteLabelConfigSchema = new Schema<WhiteLabelConfigDocument>(
  {
    organizationId:   { type: String, required: true, unique: true },
    companyName:      { type: String, default: '' },
    domain:           { type: String, default: '' },
    logoUrl:          { type: String, default: '' },
    faviconUrl:       { type: String, default: '' },
    emailFromName:    { type: String, default: '' },
    emailFromAddress: { type: String, default: '' },
    emailLogoUrl:     { type: String, default: '' },
    primaryColor:     { type: String, default: '#6366f1' },
    accentColor:      { type: String, default: '#8b5cf6' },
    backgroundColor:  { type: String, default: '#ffffff' },
    fontFamily:       { type: String, default: 'Inter, sans-serif' },
    supportEmail:     { type: String, default: '' },
    supportUrl:       { type: String, default: '' },
    privacyUrl:       { type: String, default: '' },
    termsUrl:         { type: String, default: '' },
    hidePoweredBy:    { type: Boolean, default: false },
    customCss:        { type: String, default: '' },
    ssoEnabled:       { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false, toJSON: { virtuals: true, transform: (_doc, ret) => { ret.id = ret._id.toString(); delete (ret as any)._id; return ret; } } }
);

export const WhiteLabelConfigModel = model<WhiteLabelConfigDocument>('WhiteLabelConfig', WhiteLabelConfigSchema);
