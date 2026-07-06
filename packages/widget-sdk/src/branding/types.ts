/**
 * branding/types.ts — All C.7 Branding & White Label types. Pure contracts.
 */

// ─── Color palette ────────────────────────────────────────────────────────────

export interface BrandColors {
  /** Primary action color (buttons, links, highlights). */
  primary:      string;
  /** Secondary brand color. */
  secondary?:   string;
  /** Accent color for emphasis. */
  accent?:      string;
  /** Background color. */
  background?:  string;
  /** Surface/card color. */
  surface?:     string;
  /** Body text color. */
  text?:        string;
  /** Success state color. */
  success?:     string;
  /** Warning state color. */
  warning?:     string;
  /** Danger/error state color. */
  danger?:      string;
}

/** Full computed palette including derived states (hover, pressed, disabled, border). */
export interface BrandPalette extends Required<BrandColors> {
  // Derived from primary
  primaryHover:    string;
  primaryPressed:  string;
  primaryDisabled: string;
  primaryBorder:   string;
  // Derived from secondary
  secondaryHover:  string;
  // Foreground (auto-computed for contrast)
  primaryForeground: string;
}

// ─── Typography ───────────────────────────────────────────────────────────────

export interface BrandTypography {
  fontFamily?:       string;
  headingScale?:     'compact' | 'normal' | 'large';
  bodyScale?:        'compact' | 'normal' | 'large';
  lineHeight?:       'tight' | 'normal' | 'relaxed';
  letterSpacing?:    'tight' | 'normal' | 'wide';
  weight?:           'light' | 'normal' | 'medium' | 'bold';
}

export interface ResolvedTypography {
  fontFamily:    string;
  headingSize:   string;
  bodySize:      string;
  smallSize:     string;
  lineHeight:    string;
  letterSpacing: string;
  fontWeight:    string;
}

// ─── Border & shadow ──────────────────────────────────────────────────────────

export type CornerRadius = 'none' | 'small' | 'medium' | 'large' | 'pill';
export type ShadowPreset = 'none' | 'subtle' | 'medium' | 'strong';
export type AnimationPreset = 'none' | 'subtle' | 'normal' | 'expressive';

// ─── Assets ───────────────────────────────────────────────────────────────────

export interface BrandAssets {
  /** Company logo URL or base64 data URI. */
  logo?:        string;
  /** Launcher button icon (SVG string or URL). */
  launcherIcon?: string;
  /** Conversation header avatar (URL or base64). */
  avatar?:      string;
  /** Placeholder image for empty states. */
  placeholder?: string;
}

export type AssetType = keyof BrandAssets;

export interface AssetValidation {
  valid:    boolean;
  asset:    AssetType;
  reason?:  string;
}

// ─── White label config ───────────────────────────────────────────────────────

export interface WhiteLabelConfig {
  /** Hide "Powered by LeadFlow" footer. */
  hidePoweredBy?:     boolean;
  /** Replace "Powered by" text. */
  poweredByText?:     string;
  /** Company name shown in header. */
  companyName?:       string;
  /** Custom brand colors. */
  colors?:            Partial<BrandColors>;
  /** Custom typography. */
  typography?:        BrandTypography;
  /** Custom assets. */
  assets?:            BrandAssets;
  /** Corner radius preset. */
  cornerRadius?:      CornerRadius;
  /** Shadow preset. */
  shadowPreset?:      ShadowPreset;
  /** Animation preset. */
  animationPreset?:   AnimationPreset;
}

// ─── Full brand config ────────────────────────────────────────────────────────

export interface BrandConfig {
  /** Company/brand name. */
  companyName?:       string;
  /** Theme mode override. */
  themeMode?:         'light' | 'dark' | 'auto' | 'custom';
  /** Color configuration. */
  colors?:            Partial<BrandColors>;
  /** Typography configuration. */
  typography?:        BrandTypography;
  /** Asset configuration. */
  assets?:            BrandAssets;
  /** Corner radius preset. */
  cornerRadius?:      CornerRadius;
  /** Shadow preset. */
  shadowPreset?:      ShadowPreset;
  /** Animation preset. */
  animationPreset?:   AnimationPreset;
  /** White label overrides. */
  whiteLabel?:        WhiteLabelConfig;
}

// ─── Active brand state ───────────────────────────────────────────────────────

export interface ActiveBrand {
  companyName:       string;
  themeMode:         string;
  palette:           BrandPalette;
  typography:        ResolvedTypography;
  cornerRadius:      string;
  shadow:            string;
  animationPreset:   AnimationPreset;
  whiteLabelEnabled: boolean;
  hidePoweredBy:     boolean;
  poweredByText:     string;
  assets:            BrandAssets;
}

// ─── Diagnostics ─────────────────────────────────────────────────────────────

export interface BrandingDiagnostics {
  brandingEnabled:    boolean;
  whiteLabelEnabled:  boolean;
  activeBrand:        string;
  activePalette:      string;
  activeTypography:   string;
  logoConfigured:     boolean;
  avatarConfigured:   boolean;
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface IColorEngine {
  generate(colors: Partial<BrandColors>): BrandPalette;
  getDefaults(mode: 'light' | 'dark'): BrandPalette;
}

export interface ITypographyEngine {
  resolve(config?: BrandTypography): ResolvedTypography;
  getDefaults(): ResolvedTypography;
  toCSSVars(resolved: ResolvedTypography): Record<string, string>;
}

export interface IAssetsManager {
  set(type: AssetType, value: string): AssetValidation;
  get(type: AssetType): string | null;
  clear(type: AssetType): void;
  clearAll(): void;
  validate(type: AssetType, value: string): AssetValidation;
  getAll(): Readonly<BrandAssets>;
}

export interface IWhiteLabelManager {
  apply(config: WhiteLabelConfig): void;
  reset(): void;
  isEnabled(): boolean;
  getConfig(): Readonly<WhiteLabelConfig>;
}

export interface IBrandingController {
  apply(config: BrandConfig): void;
  reset(): void;
  getActiveBrand(): Readonly<ActiveBrand>;
  getDiagnostics(): BrandingDiagnostics;
  destroy(): void;
}
