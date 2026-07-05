/**
 * integration/types.ts — All C.5 Integration & Installation types.
 * Pure contracts. No implementations.
 */

// ─── Embed modes ──────────────────────────────────────────────────────────────

export type EmbedMode =
  | 'inline'
  | 'floating'
  | 'fullscreen'
  | 'popover'; // future

// ─── Installation status ──────────────────────────────────────────────────────

export type InstallationStatus =
  | 'not-installed'
  | 'installing'
  | 'installed'
  | 'destroyed'
  | 'error';

// ─── Browser capabilities ─────────────────────────────────────────────────────

export interface BrowserCapabilities {
  shadowDOM:            boolean;
  webAnimationsAPI:     boolean;
  abortController:      boolean;
  fetch:                boolean;
  localStorage:         boolean;
  resizeObserver:       boolean;
  intersectionObserver: boolean;
  customElements:       boolean;
  cssVariables:         boolean;
}

// ─── Compatibility result ─────────────────────────────────────────────────────

export interface CompatibilityResult {
  compatible:   boolean;
  capabilities: BrowserCapabilities;
  warnings:     string[];
  /** Features that will degrade gracefully (non-fatal). */
  degraded:     string[];
  /** Features that are completely unavailable (fatal). */
  missing:      string[];
}

// ─── Extended config (C.5 additions) ─────────────────────────────────────────

export interface EmbedConfig {
  embedMode?:  EmbedMode;
  locale?:     string;
  version?:    string;
}

// ─── Validation result ────────────────────────────────────────────────────────

export interface ValidationResult {
  valid:    boolean;
  errors:   string[];
  warnings: string[];
}

// ─── Installation result ──────────────────────────────────────────────────────

export interface InstallResult {
  success:            boolean;
  status:             InstallationStatus;
  compatibilityResult: CompatibilityResult;
  validationResult:   ValidationResult;
  installedAt:        string | null;
  embedMode:          EmbedMode;
  duplicatePrevented: boolean;
  error?:             string;
}

// ─── Lifecycle state ─────────────────────────────────────────────────────────

export interface InstallationState {
  status:             InstallationStatus;
  installedAt:        string | null;
  embedMode:          EmbedMode;
  compatibilityWarnings: string[];
  browserCapabilities:   BrowserCapabilities;
  duplicateInstallationPrevented: boolean;
  reinstallCount:     number;
}

// ─── Diagnostics (C.5 additions) ─────────────────────────────────────────────

export interface InstallationDiagnostics {
  installationStatus:            InstallationStatus;
  installationTime:              string | null;
  embedMode:                     EmbedMode;
  compatibilityWarnings:         string[];
  browserCapabilities:           BrowserCapabilities;
  duplicateInstallationPrevented: boolean;
}

// ─── Installer interface ──────────────────────────────────────────────────────

export interface IInstaller {
  install(embedMode?: EmbedMode): InstallResult;
  isDuplicate(): boolean;
  getCompatibility(): CompatibilityResult;
}

// ─── Lifecycle manager interface ──────────────────────────────────────────────

export interface ILifecycleManager {
  install(embedMode?: EmbedMode):  Promise<InstallResult>;
  uninstall():                     void;
  reinstall(embedMode?: EmbedMode): Promise<InstallResult>;
  reload():                        Promise<InstallResult>;
  status():                        InstallationStatus;
  getState():                      InstallationState;
  getDiagnostics():                InstallationDiagnostics;
  destroy():                       void;
}
