/**
 * launcher/types.ts — All Launcher System types. Pure contracts.
 */

// ─── Launcher state ───────────────────────────────────────────────────────────

export type LauncherState =
  | 'closed'    // button visible, chat not open
  | 'opening'   // transition in progress → open
  | 'open'      // chat is open
  | 'closing'   // transition in progress → closed
  | 'hidden'    // launcher invisible (hide() called)
  | 'disabled'; // launcher non-interactive (disable() called)

export interface LauncherStatus {
  state:       LauncherState;
  visible:     boolean;
  enabled:     boolean;
  toggleCount: number;
  openedAt:    string | null;
}

// ─── Launcher position ────────────────────────────────────────────────────────

export type LauncherPosition =
  | 'bottom-right'
  | 'bottom-left'
  | 'top-right'
  | 'top-left'
  | 'center-right'
  | 'center-left';

// ─── Badge ────────────────────────────────────────────────────────────────────

export type BadgeType = 'count' | 'dot' | 'hidden';

export interface LauncherBadge {
  type:    BadgeType;
  count:   number;
  visible: boolean;
}

// ─── Icon ─────────────────────────────────────────────────────────────────────

export interface LauncherIcon {
  /** SVG string for the icon. Defaults to the LeadFlow chat bubble. */
  svg:     string;
  /** Accessible label for screen readers. */
  label:   string;
}

// ─── Diagnostics ─────────────────────────────────────────────────────────────

export interface LauncherDiagnostics {
  launcherVisible:  boolean;
  launcherEnabled:  boolean;
  launcherOpen:     boolean;
  launcherPosition: LauncherPosition;
  badgeCount:       number;
  toggleCount:      number;
}

// ─── Controller interface ─────────────────────────────────────────────────────

export interface ILauncherController {
  open():    void;
  close():   void;
  toggle():  void;
  show():    void;
  hide():    void;
  enable():  void;
  disable(): void;
  isOpen():  boolean;
  getState(): LauncherState;
  getStatus(): LauncherStatus;
  getDiagnostics(): LauncherDiagnostics;
  setBadgeCount(count: number): void;
  showBadge(): void;
  hideBadge(): void;
  clearBadge(): void;
  setPosition(position: LauncherPosition): void;
  destroy(): void;
}
