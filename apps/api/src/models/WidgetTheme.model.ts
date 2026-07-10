/**
 * WidgetTheme.model.ts — Built-in and custom organization themes.
 */

import { Schema, model, Document } from 'mongoose';
import type { IThemeColors, ITypography, ButtonStyle, ShadowStyle, AnimationStyle } from './WidgetConfiguration.model';

export type ThemeType = 'light' | 'dark' | 'minimal' | 'glass' | 'corporate' | 'modern' | 'luxury' | 'custom';

export interface IWidgetTheme {
  id:             string;
  organizationId: string | null;   // null = global system theme
  name:           string;
  type:           ThemeType;
  colors:         IThemeColors;
  typography:     ITypography;
  borderRadius:   number;
  buttonStyle:    ButtonStyle;
  shadowStyle:    ShadowStyle;
  animation:      AnimationStyle;
  isSystem:       boolean;
  previewUrl:     string;
  createdAt:      Date;
}

export interface WidgetThemeDocument extends Omit<IWidgetTheme, 'id'>, Document {}

const WidgetThemeSchema = new Schema<WidgetThemeDocument>(
  {
    organizationId: { type: String, default: null, index: true },
    name:           { type: String, required: true },
    type:           { type: String, enum: ['light','dark','minimal','glass','corporate','modern','luxury','custom'], default: 'light' },
    colors:         { type: Schema.Types.Mixed, default: {} },
    typography:     { type: Schema.Types.Mixed, default: {} },
    borderRadius:   { type: Number, default: 12 },
    buttonStyle:    { type: String, default: 'rounded' },
    shadowStyle:    { type: String, default: 'lg' },
    animation:      { type: String, default: 'scale' },
    isSystem:       { type: Boolean, default: false },
    previewUrl:     { type: String, default: '' },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => { ret.id = ret._id.toString(); delete (ret as any)._id; return ret; },
    },
  }
);

export const WidgetThemeModel = model<WidgetThemeDocument>('WidgetTheme', WidgetThemeSchema);
