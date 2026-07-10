/**
 * ThemeService.ts
 *
 * Manages built-in system themes and organization custom themes.
 * System themes are seeded once at startup.
 */

import { WidgetThemeModel, IWidgetTheme } from '../../models/WidgetTheme.model';
import { ApiError } from '../../middleware/errorHandler';

// ─── System theme definitions ─────────────────────────────────────────────────

const SYSTEM_THEMES: Array<Omit<IWidgetTheme, 'id' | 'createdAt'>> = [
  {
    organizationId: null, name: 'Light', type: 'light', isSystem: true, previewUrl: '', borderRadius: 12, buttonStyle: 'rounded', shadowStyle: 'lg', animation: 'scale',
    colors: { accentColor: '#6366f1', backgroundColor: '#ffffff', surfaceColor: '#f8fafc', textPrimary: '#0f172a', textSecondary: '#64748b', borderColor: '#e2e8f0', userBubbleColor: '#6366f1', aiBubbleColor: '#f1f5f9', userTextColor: '#ffffff', aiTextColor: '#0f172a' },
    typography: { fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: '400', lineHeight: '1.5', customFontUrl: '' },
  },
  {
    organizationId: null, name: 'Dark', type: 'dark', isSystem: true, previewUrl: '', borderRadius: 12, buttonStyle: 'rounded', shadowStyle: 'lg', animation: 'fade',
    colors: { accentColor: '#818cf8', backgroundColor: '#0f172a', surfaceColor: '#1e293b', textPrimary: '#f1f5f9', textSecondary: '#94a3b8', borderColor: '#334155', userBubbleColor: '#818cf8', aiBubbleColor: '#1e293b', userTextColor: '#ffffff', aiTextColor: '#f1f5f9' },
    typography: { fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: '400', lineHeight: '1.5', customFontUrl: '' },
  },
  {
    organizationId: null, name: 'Minimal', type: 'minimal', isSystem: true, previewUrl: '', borderRadius: 4, buttonStyle: 'square', shadowStyle: 'none', animation: 'none',
    colors: { accentColor: '#000000', backgroundColor: '#ffffff', surfaceColor: '#fafafa', textPrimary: '#111111', textSecondary: '#555555', borderColor: '#dddddd', userBubbleColor: '#111111', aiBubbleColor: '#f0f0f0', userTextColor: '#ffffff', aiTextColor: '#111111' },
    typography: { fontFamily: 'system-ui, sans-serif', fontSize: '13px', fontWeight: '400', lineHeight: '1.4', customFontUrl: '' },
  },
  {
    organizationId: null, name: 'Glass', type: 'glass', isSystem: true, previewUrl: '', borderRadius: 16, buttonStyle: 'pill', shadowStyle: 'glow', animation: 'elastic',
    colors: { accentColor: '#8b5cf6', backgroundColor: 'rgba(255,255,255,0.15)', surfaceColor: 'rgba(255,255,255,0.1)', textPrimary: '#1e1b4b', textSecondary: '#4c1d95', borderColor: 'rgba(255,255,255,0.3)', userBubbleColor: '#8b5cf6', aiBubbleColor: 'rgba(255,255,255,0.2)', userTextColor: '#ffffff', aiTextColor: '#1e1b4b' },
    typography: { fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: '400', lineHeight: '1.5', customFontUrl: '' },
  },
  {
    organizationId: null, name: 'Corporate', type: 'corporate', isSystem: true, previewUrl: '', borderRadius: 4, buttonStyle: 'square', shadowStyle: 'sm', animation: 'slide',
    colors: { accentColor: '#1d4ed8', backgroundColor: '#ffffff', surfaceColor: '#eff6ff', textPrimary: '#1e3a5f', textSecondary: '#3b5a87', borderColor: '#bfdbfe', userBubbleColor: '#1d4ed8', aiBubbleColor: '#eff6ff', userTextColor: '#ffffff', aiTextColor: '#1e3a5f' },
    typography: { fontFamily: 'Segoe UI, Arial, sans-serif', fontSize: '14px', fontWeight: '400', lineHeight: '1.5', customFontUrl: '' },
  },
  {
    organizationId: null, name: 'Modern', type: 'modern', isSystem: true, previewUrl: '', borderRadius: 20, buttonStyle: 'pill', shadowStyle: 'xl', animation: 'bounce',
    colors: { accentColor: '#06b6d4', backgroundColor: '#ffffff', surfaceColor: '#ecfeff', textPrimary: '#164e63', textSecondary: '#0891b2', borderColor: '#a5f3fc', userBubbleColor: '#06b6d4', aiBubbleColor: '#ecfeff', userTextColor: '#ffffff', aiTextColor: '#164e63' },
    typography: { fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', fontSize: '14px', fontWeight: '400', lineHeight: '1.6', customFontUrl: '' },
  },
  {
    organizationId: null, name: 'Luxury', type: 'luxury', isSystem: true, previewUrl: '', borderRadius: 2, buttonStyle: 'square', shadowStyle: 'xl', animation: 'fade',
    colors: { accentColor: '#d4af37', backgroundColor: '#0a0a0a', surfaceColor: '#1a1a1a', textPrimary: '#f5e6c8', textSecondary: '#c9a84c', borderColor: '#2a2a2a', userBubbleColor: '#d4af37', aiBubbleColor: '#1a1a1a', userTextColor: '#0a0a0a', aiTextColor: '#f5e6c8' },
    typography: { fontFamily: 'Playfair Display, Georgia, serif', fontSize: '14px', fontWeight: '400', lineHeight: '1.6', customFontUrl: '' },
  },
];

export const ThemeService = {

  async listAll(organizationId: string): Promise<IWidgetTheme[]> {
    const docs = await WidgetThemeModel.find({
      $or: [{ isSystem: true }, { organizationId }],
    }).sort({ isSystem: -1, name: 1 });
    return docs.map(d => d.toJSON() as unknown as IWidgetTheme);
  },

  async getById(id: string): Promise<IWidgetTheme> {
    const doc = await WidgetThemeModel.findById(id);
    if (!doc) throw new ApiError(404, 'Theme not found', 'THEME_NOT_FOUND');
    return doc.toJSON() as unknown as IWidgetTheme;
  },

  async duplicate(themeId: string, organizationId: string, name: string): Promise<IWidgetTheme> {
    const source = await WidgetThemeModel.findById(themeId);
    if (!source) throw new ApiError(404, 'Theme not found', 'THEME_NOT_FOUND');
    const doc = await WidgetThemeModel.create({
      organizationId,
      name,
      type:         'custom',
      colors:       source.colors,
      typography:   source.typography,
      borderRadius: source.borderRadius,
      buttonStyle:  source.buttonStyle,
      shadowStyle:  source.shadowStyle,
      animation:    source.animation,
      isSystem:     false,
    });
    return doc.toJSON() as unknown as IWidgetTheme;
  },

  async update(organizationId: string, id: string, data: Partial<IWidgetTheme>): Promise<IWidgetTheme> {
    const doc = await WidgetThemeModel.findOneAndUpdate(
      { _id: id, organizationId, isSystem: false },
      data,
      { new: true }
    );
    if (!doc) throw new ApiError(404, 'Theme not found or is a system theme', 'THEME_NOT_FOUND');
    return doc.toJSON() as unknown as IWidgetTheme;
  },

  async delete(organizationId: string, id: string): Promise<void> {
    const doc = await WidgetThemeModel.findOneAndDelete({ _id: id, organizationId, isSystem: false });
    if (!doc) throw new ApiError(404, 'Theme not found', 'THEME_NOT_FOUND');
  },

  async seedSystemThemes(): Promise<void> {
    const existing = await WidgetThemeModel.countDocuments({ isSystem: true });
    if (existing >= SYSTEM_THEMES.length) return;
    for (const theme of SYSTEM_THEMES) {
      await WidgetThemeModel.findOneAndUpdate(
        { name: theme.name, isSystem: true },
        { $setOnInsert: theme },
        { upsert: true }
      );
    }
  },
};
