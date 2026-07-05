/**
 * types.ts — All public SDK types. Single source of truth.
 */

import type { RuntimeState }       from './constants';
import type { IEventBus }          from './eventBus';
import type { IWidgetModule }      from './module';
import type { WidgetEventName, ConfigurationSource } from './events';
import type { ConfigurationService } from './configuration/service';
import type { TransportClient }    from './transport/types';
import type { TransportAdapter }   from './transport/types';
import type { CredentialsManager } from './auth/manager';
import type { CredentialsProvider } from './auth/types';
import type { IRequestOrchestrator } from './orchestrator/types';
import type { IRetryEngine }         from './retry/types';
import type { IResilienceManager }   from './resilience/types';
import type { IConnectivityManager } from './connectivity/types';
import type { IRealtimeManager }     from './realtime/types';
import type { IRenderer }            from './rendering/types';
import type { IUIFoundation }        from './ui/types';
import type { ILauncherController } from './launcher/types';
import type { IConversationController } from './conversation/types';
import type { ILifecycleManager, EmbedMode, InstallResult } from './integration/types';

// ─── Widget position ──────────────────────────────────────────────────────────

export type WidgetPosition =
  | 'bottom-right'
  | 'bottom-left'
  | 'top-right'
  | 'top-left';

// ─── Widget theme ─────────────────────────────────────────────────────────────

export type WidgetTheme = 'light' | 'dark' | 'auto';

// ─── Widget configuration ────────────────────────────────────────────────────

export interface WidgetConfig {
  businessId:   string;
  position:     WidgetPosition;
  theme:        WidgetTheme;
  primaryColor: string;
}

// ─── Initialization status ───────────────────────────────────────────────────

export type InitializationStatus =
  | 'mounted'
  | 'already-initialized'
  | 'error';

// ─── Runtime status ───────────────────────────────────────────────────────────

export type RuntimeStatus = typeof RuntimeState[keyof typeof RuntimeState];

// ─── Widget runtime ───────────────────────────────────────────────────────────

export interface WidgetRuntime {
  status:        RuntimeStatus;
  /** @deprecated Use runtime.configuration.getResolvedConfig() instead. */
  config:        WidgetConfig | null;
  rootElement:   HTMLDivElement | null;
  initializedAt: string | null;
  sdkVersion:    string;
  lastError:     string | null;
  eventBus:      IEventBus;
  /** B.1.4: The Configuration Service instance owned by this runtime. */
  configuration: ConfigurationService;
  /** B.2.1: The Transport Client instance owned by this runtime. */
  transport:     TransportClient;
  /** B.2.3: The Credentials Manager instance owned by this runtime. */
  credentials:   CredentialsManager;
  /** B.2.4: The Request Orchestrator instance owned by this runtime. */
  orchestrator:  IRequestOrchestrator;
  /** B.2.5: The Retry Engine instance owned by this runtime. */
  retryEngine:   IRetryEngine;
  /** B.2.6: The Resilience Manager instance owned by this runtime. */
  resilience:    IResilienceManager;
  /** B.2.7: The Connectivity Manager instance owned by this runtime. */
  connectivity:  IConnectivityManager;
  /** B.2.8: The Realtime Manager instance owned by this runtime. */
  realtime:      IRealtimeManager;
  /** C.1: The Widget Renderer instance owned by this runtime. */
  renderer:      IRenderer;
  /** C.2: The UI Foundation instance owned by this runtime. */
  ui:            IUIFoundation;
  /** C.3: The Launcher Controller instance owned by this runtime. */
  launcher:      ILauncherController | null;
  /** C.4: The Conversation Controller instance owned by this runtime. */
  conversation:  IConversationController | null;
  /** C.5: The Installation Lifecycle Manager owned by this runtime. */
  installation:  ILifecycleManager | null;
}

// ─── Diagnostics ─────────────────────────────────────────────────────────────

export interface DiagnosticsInfo {
  // B.1.2 fields
  initializedAt:    string | null;
  sdkVersion:       string;
  widgetVersion:    string;
  browser:          string;
  userAgent:        string;
  environment:      'browser' | 'unknown';
  rootMounted:      boolean;
  status:           RuntimeStatus;
  businessId:       string | null;

  // B.1.3 fields
  registeredModules: string[];
  listenerCount:    number;
  lastEvent:        WidgetEventName | null;
  eventHistorySize: number;
  runtimeStatus:    RuntimeStatus;

  // B.1.4 additions
  configurationSource:    ConfigurationSource;
  resolvedConfig:         WidgetConfig | null;
  overrideCount:          number;
  validationWarnings:     string[];
  configurationVersion:   number;

  // B.2.1 additions
  transportAdapter:       string;
  middlewareCount:        number;
  lastRequestDuration:    number | null;
  lastTransportError:     string | null;

  // B.2.2 additions (fetch adapter diagnostics — null when mock adapter is active)
  lastFetchDuration:      number | null;
  lastStatusCode:         number | null;
  lastResponseSize:       number | null;

  // B.2.3 additions
  credentialsProviderId:  string;
  credentialsAuthenticated: boolean;
  credentialsHeaderCount: number;
  credentialsLastRefresh: string | null;

  // B.2.4 additions
  queueLength:          number;
  processedRequests:    number;
  pendingRequests:      number;
  orchestratorPaused:   boolean;
  schedulerType:        string;
  averageQueueTime:     number | null;

  // B.2.5 additions
  totalRetries:         number;
  successfulRetries:    number;
  failedRetries:        number;
  averageAttempts:      number | null;
  lastRetryDelay:       number | null;
  activeRetryPolicy:    string;

  // B.2.6 additions
  activeResilienceContexts: number;
  timeoutsTriggered:        number;
  deadlinesExpired:         number;
  cancelledRequests:        number;
  averageContextLifetime:   number | null;

  // B.2.7 additions
  connectivityOnline:       boolean;
  offlineQueueLength:       number;
  deferredRequests:         number;
  replayedRequests:         number;
  failedReplays:            number;
  lastReconnect:            string | null;

  // B.2.8 additions
  realtimeStatus:           string;
  realtimeConnectedAt:      string | null;
  realtimeReconnectCount:   number;
  realtimeHeartbeatCount:   number;
  realtimeSubscriptions:    string[];
  realtimeAdapterType:      string;

  // C.1 additions
  rendererMounted:        boolean;
  rendererShadowDOM:      boolean;
  rendererContainerReady: boolean;
  rendererStylesInjected: boolean;
  rendererRenderCount:    number;

  // C.2 additions
  activeTheme:       string;
  themeMode:         string;
  overlayCount:      number;
  activeAnimations:  number;
  viewport:          string;
  componentCount:    number;

  // C.3 additions
  launcherVisible:   boolean;
  launcherEnabled:   boolean;
  launcherOpen:      boolean;
  launcherPosition:  string;
  badgeCount:        number;
  launcherToggleCount: number;

  // C.4 additions
  conversationVisible: boolean;
  conversationState:   string;
  inputLength:         number;
  messageCount:        number;
  minimized:           boolean;
  fullscreen:          boolean;

  // C.5 additions
  installationStatus:             string;
  installationTime:               string | null;
  embedMode:                      string;
  compatibilityWarnings:          string[];
  browserCapabilities:            import('./integration/types').BrowserCapabilities;
  duplicateInstallationPrevented: boolean;
}

// ─── Public SDK API ──────────────────────────────────────────────────────────

export interface LeadFlowSDK {
  // B.1.1 / B.1.2
  initialize:     (config: WidgetConfig) => Promise<InitializationStatus>;
  destroy:        () => void;
  getStatus:      () => RuntimeStatus;
  getVersion:     () => string;
  getConfig:      () => WidgetConfig | null;
  getDiagnostics: () => DiagnosticsInfo;
  runtime:        WidgetRuntime;

  // B.1.3
  eventBus:         IEventBus;
  registerModule:   (mod: IWidgetModule) => boolean;
  unregisterModule: (id: string) => boolean;
  listModules:      () => string[];

  // B.1.4
  getConfiguration:          () => Readonly<WidgetConfig> | null;
  reloadConfiguration:       () => Readonly<WidgetConfig> | null;
  setConfigurationOverrides: (overrides: Partial<WidgetConfig>) => Readonly<WidgetConfig> | null;
  resetConfiguration:        () => Readonly<WidgetConfig> | null;

  // B.2.1
  transport: TransportClient;
  setTransportAdapter: (adapter: TransportAdapter) => void;
  getTransportAdapter: () => string;

  // B.2.3
  credentials:          CredentialsManager;
  setCredentialsProvider: (provider: CredentialsProvider) => void;
  isAuthenticated:        () => boolean;

  // B.2.4
  /** The request orchestrator — submit requests for serialised execution. */
  orchestrator: IRequestOrchestrator;

  // B.2.5
  /** The retry engine — set policy, inspect retry diagnostics. */
  retryEngine: IRetryEngine;

  // B.2.6
  /** The resilience manager — timeout, deadline, and cancellation management. */
  resilience: IResilienceManager;

  // B.2.7
  /** The connectivity manager — online/offline detection and offline queue. */
  connectivity: IConnectivityManager;

  // B.2.8
  /** The realtime manager — connection, channels, heartbeat. */
  realtime: IRealtimeManager;

  // C.1
  /** The widget renderer — Shadow DOM, container, styles. */
  renderer: IRenderer;

  // C.2
  /** The UI Foundation — theme, layout, animation, overlay, focus, responsive. */
  ui: IUIFoundation;

  // C.3
  /** The launcher controller — open/close/toggle/badge/position. */
  launcher: ILauncherController | null;

  // C.4
  /** The conversation controller — shell, header, body, composer. */
  conversation: IConversationController | null;

  // C.5
  /** The installation lifecycle manager. */
  installation:           ILifecycleManager | null;
  install:                (embedMode?: EmbedMode) => Promise<InstallResult>;
  uninstall:              () => void;
  reinstall:              (embedMode?: EmbedMode) => Promise<InstallResult>;
  reload:                 () => Promise<InstallResult>;
  getInstallationStatus:  () => import('./integration/types').InstallationStatus;
}
