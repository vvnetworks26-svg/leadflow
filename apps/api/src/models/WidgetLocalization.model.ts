/**
 * WidgetLocalization.model.ts — Per-org translations for supported locales.
 */

import { Schema, model, Document } from 'mongoose';

export type LocaleCode = 'en' | 'es' | 'fr' | 'de' | 'pt' | 'ar' | 'hi' | 'zh' | 'ja' | 'it' | string;

export interface ILocaleStrings {
  welcomeMessage:    string;
  placeholder:       string;
  sendButton:        string;
  typingIndicator:   string;
  offlineMessage:    string;
  closeButton:       string;
  minimizeButton:    string;
  poweredBy:         string;
  bookingButton:     string;
  errorMessage:      string;
  [key: string]:     string;   // custom keys
}

export interface IWidgetLocalization {
  id:             string;
  organizationId: string;
  localeCode:     LocaleCode;
  isRTL:          boolean;
  strings:        ILocaleStrings;
  isDefault:      boolean;
  createdAt:      Date;
  updatedAt:      Date;
}

export interface WidgetLocalizationDocument extends Omit<IWidgetLocalization, 'id'>, Document {}

const WidgetLocalizationSchema = new Schema<WidgetLocalizationDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    localeCode:     { type: String, required: true },
    isRTL:          { type: Boolean, default: false },
    strings:        { type: Schema.Types.Mixed, default: {} },
    isDefault:      { type: Boolean, default: false },
  },
  {
    timestamps: true, versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => { ret.id = ret._id.toString(); delete (ret as any)._id; return ret; },
    },
  }
);

WidgetLocalizationSchema.index({ organizationId: 1, localeCode: 1 }, { unique: true });

export const WidgetLocalizationModel = model<WidgetLocalizationDocument>('WidgetLocalization', WidgetLocalizationSchema);
