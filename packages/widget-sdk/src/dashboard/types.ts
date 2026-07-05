/**
 * dashboard/types.ts — All C.6 Dashboard Integration types. Pure contracts.
 */

import type { WidgetConfig }  from '../types';
import type { ConfigLayer }   from '../configuration/resolver';

// ─── Dashboard config ─────────────────────────────────────────────────────────

/**
 * Dashboard-supplied configuration (Layer 4 — higher than script attributes,
 * lower than runtime overrides).
 *
 * All fields are optional — the dashboard may supply any subset.
 * Fields not supplied fall back to lower layers.
 */
export type DashboardConfig = Partial<WidgetConfig> & {
  /** Optional metadata — not applied to runtime config. */
  _meta?: DashboardConfigMeta;
};

export interface DashboardConfigMeta {
  /** Source identifier (e.g. dashboard instance URL, tenant id). */
  source?:    string;
  /** ISO timestamp of when this config was generated on the dashboard. */
  issuedAt?:  string;
  /** Semantic version of the dashboard config schema. */
  schemaVersion?: string;
}

// ─── Sync state ───────────────────────────────────────────────────────────────

export type SyncStatus =
  | 'idle'
  | 'syncing'
  | 'synced'
  | 'failed'
  | 'rolled-back';

export interface SyncState {
  status:           SyncStatus;
  version:          number;
  lastSync:         string | null;
  pendingUpdates:   number;
  rollbackAvailable: boolean;
  error:            string | null;
}

// ─── Config diff ──────────────────────────────────────────────────────────────

export interface ConfigDiff {
  field:    keyof WidgetConfig;
  previous: string | undefined;
  current:  string;
}

// ─── Sync result ──────────────────────────────────────────────────────────────

export interface SyncResult {
  success:     boolean;
  version:     number;
  changedFields: string[];
  diff:        ConfigDiff[];
  rolledBack:  boolean;
  error?:      string;
}

// ─── Observer snapshot ───────────────────────────────────────────────────────

export interface ObservedState {
  theme:              string;
  launcherOpen:       boolean;
  launcherVisible:    boolean;
  conversationState:  string;
  installationStatus: string;
  viewport:           string;
  configVersion:      number;
  resolvedConfig:     Readonly<WidgetConfig> | null;
}

// ─── Dashboard diagnostics ───────────────────────────────────────────────────

export interface DashboardDiagnostics {
  dashboardConnected:  boolean;
  configVersion:       number;
  lastSync:            string | null;
  pendingUpdates:      number;
  rollbackAvailable:   boolean;
  configurationSource: string;
}

// ─── Sync engine interface ───────────────────────────────────────────────────

export interface ISyncEngine {
  initialSync(config: DashboardConfig):  SyncResult;
  apply(config: DashboardConfig):        SyncResult;
  refresh():                             SyncResult;
  rollback():                            SyncResult;
  version():                             number;
  getState():                            SyncState;
  canRollback():                         boolean;
}

// ─── Observer interface ───────────────────────────────────────────────────────

export interface IObserver {
  snapshot():  ObservedState;
  onChange(listener: (state: ObservedState) => void): () => void;
  destroy():   void;
}

// ─── Bridge interface ─────────────────────────────────────────────────────────

export interface IBridge {
  connect(config?: DashboardConfig): SyncResult;
  disconnect():                      void;
  push(config: DashboardConfig):     SyncResult;
  pull():                            ObservedState;
  isConnected():                     boolean;
  getVersion():                      number;
}

// ─── Dashboard controller interface ──────────────────────────────────────────

export interface IDashboardController {
  connect(config?: DashboardConfig): SyncResult;
  disconnect():                      void;
  push(config: DashboardConfig):     SyncResult;
  pull():                            ObservedState;
  rollback():                        SyncResult;
  isConnected():                     boolean;
  getVersion():                      number;
  getState():                        SyncState;
  getDiagnostics():                  DashboardDiagnostics;
  destroy():                         void;
}

// Re-export ConfigLayer for internal use
export type { ConfigLayer };
