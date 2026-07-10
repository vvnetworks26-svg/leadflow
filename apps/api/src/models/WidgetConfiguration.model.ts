/**
 * WidgetConfiguration.model.ts
 *
 * Master widget config per organization.
 * One document per org — the single source of truth for widget appearance,
 * behavior, branding, and deployment settings.
 */

import { Schema, model, Document } from 'mongoose';

export type LauncherType = 'floating_bubble' | 'side_tab' | 'inline' | 'embedded_card' | 'fullscreen' | 'custom_button';
export type LauncherPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center-right' | 'center-left';
export type AnimationStyle = 'none' | 'fade' | 'slide' | 'bounce' | 'scale' | 'elastic';
export type ShadowStyle = 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'glow';
export type ButtonStyle = 'rounded' | 'pill' | 'square' | 'soft';

export interface IBranding {
  companyName:     string;
  widgetName:      string;
  assistantName:   string;
  welcomeMessage:  string;
  subtitle:        string;
  logoUrl:         string;
  avatarUrl:       string;
  faviconUrl:      string;
}

export interface IThemeColors {
  accentColor:      string;
  backgroundColor:  string;
  surfaceColor:     string;
  textPrimary:      string;
  textSecondary:    string;
  borderColor:      string;
  userBubbleColor:  string;
  aiBubbleColor:    string;
  userTextColor:    string;
  aiTextColor:      string;
}

export interface ITypography {
  fontFamily:   string;
  fontSize:     string;
  fontWeight:   string;
  lineHeight:   string;
  customFontUrl:string;
}

export interface ILauncherConfig {
  type:        LauncherType;
  position:    LauncherPosition;
  offsetX:     number;
  offsetY:     number;
  size:        number;
  icon:        string;
  badgeText:   string;
  showPulse:   boolean;
  animation:   AnimationStyle;
  label:       string;
}

export interface IBehaviorConfig {
  autoOpen:               boolean;
  autoOpenDelaySeconds:   number;
  exitIntent:             boolean;
  scrollTriggerPercent:   number | null;
  mobileEnabled:          boolean;
  desktopEnabled:         boolean;
  showOnPages:            string[];   // URL patterns
  hideOnPages:            string[];
  workingHoursOnly:       boolean;
  offlineMessage:         string;
  persistConversation:    boolean;
  typingIndicators:       boolean;
  soundEnabled:           boolean;
  showTimestamps:         boolean;
  showReadReceipts:       boolean;
}

export interface IWidgetConfiguration {
  id:               string;
  organizationId:   string;
  isActive:         boolean;
  themeId:          string | null;
  branding:         IBranding;
  colors:           IThemeColors;
  typography:       ITypography;
  launcher:         ILauncherConfig;
  behavior:         IBehaviorConfig;
  localeCode:       string;
  borderRadius:     number;
  buttonStyle:      ButtonStyle;
  shadowStyle:      ShadowStyle;
  customCss:        string;          // sanitized
  customScript:     string;          // stripped for security
  publishedVersion: number | null;
  draftVersion:     number;
  createdAt:        Date;
  updatedAt:        Date;
}

export interface WidgetConfigurationDocument extends Omit<IWidgetConfiguration, 'id'>, Document {}

const BrandingSchema = new Schema({
  companyName: { type: String, default: '' }, widgetName: { type: String, default: 'Chat with us' },
  assistantName: { type: String, default: 'AI Assistant' }, welcomeMessage: { type: String, default: 'Hi! How can I help you today?' },
  subtitle: { type: String, default: 'Typically replies instantly' },
  logoUrl: { type: String, default: '' }, avatarUrl: { type: String, default: '' }, faviconUrl: { type: String, default: '' },
}, { _id: false });

const ColorsSchema = new Schema({
  accentColor: { type: String, default: '#6366f1' }, backgroundColor: { type: String, default: '#ffffff' },
  surfaceColor: { type: String, default: '#f8fafc' }, textPrimary: { type: String, default: '#0f172a' },
  textSecondary: { type: String, default: '#64748b' }, borderColor: { type: String, default: '#e2e8f0' },
  userBubbleColor: { type: String, default: '#6366f1' }, aiBubbleColor: { type: String, default: '#f1f5f9' },
  userTextColor: { type: String, default: '#ffffff' }, aiTextColor: { type: String, default: '#0f172a' },
}, { _id: false });

const TypographySchema = new Schema({
  fontFamily: { type: String, default: 'Inter, sans-serif' }, fontSize: { type: String, default: '14px' },
  fontWeight: { type: String, default: '400' }, lineHeight: { type: String, default: '1.5' },
  customFontUrl: { type: String, default: '' },
}, { _id: false });

const LauncherSchema = new Schema({
  type: { type: String, default: 'floating_bubble' }, position: { type: String, default: 'bottom-right' },
  offsetX: { type: Number, default: 24 }, offsetY: { type: Number, default: 24 },
  size: { type: Number, default: 56 }, icon: { type: String, default: 'chat' },
  badgeText: { type: String, default: '' }, showPulse: { type: Boolean, default: false },
  animation: { type: String, default: 'scale' }, label: { type: String, default: '' },
}, { _id: false });

const BehaviorSchema = new Schema({
  autoOpen: { type: Boolean, default: false }, autoOpenDelaySeconds: { type: Number, default: 5 },
  exitIntent: { type: Boolean, default: false }, scrollTriggerPercent: { type: Number, default: null },
  mobileEnabled: { type: Boolean, default: true }, desktopEnabled: { type: Boolean, default: true },
  showOnPages: { type: [String], default: [] }, hideOnPages: { type: [String], default: [] },
  workingHoursOnly: { type: Boolean, default: false }, offlineMessage: { type: String, default: 'We are currently offline. Leave a message!' },
  persistConversation: { type: Boolean, default: true }, typingIndicators: { type: Boolean, default: true },
  soundEnabled: { type: Boolean, default: false }, showTimestamps: { type: Boolean, default: true },
  showReadReceipts: { type: Boolean, default: true },
}, { _id: false });

const WidgetConfigurationSchema = new Schema<WidgetConfigurationDocument>(
  {
    organizationId:   { type: String, required: true, unique: true, index: true },
    isActive:         { type: Boolean, default: true },
    themeId:          { type: String, default: null },
    branding:         { type: BrandingSchema, default: () => ({}) },
    colors:           { type: ColorsSchema, default: () => ({}) },
    typography:       { type: TypographySchema, default: () => ({}) },
    launcher:         { type: LauncherSchema, default: () => ({}) },
    behavior:         { type: BehaviorSchema, default: () => ({}) },
    localeCode:       { type: String, default: 'en' },
    borderRadius:     { type: Number, default: 12 },
    buttonStyle:      { type: String, enum: ['rounded','pill','square','soft'], default: 'rounded' },
    shadowStyle:      { type: String, enum: ['none','sm','md','lg','xl','glow'], default: 'lg' },
    customCss:        { type: String, default: '' },
    customScript:     { type: String, default: '' },
    publishedVersion: { type: Number, default: null },
    draftVersion:     { type: Number, default: 1 },
  },
  {
    timestamps: true, versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => { ret.id = ret._id.toString(); delete (ret as any)._id; return ret; },
    },
  }
);

export const WidgetConfigurationModel = model<WidgetConfigurationDocument>('WidgetConfiguration', WidgetConfigurationSchema);
