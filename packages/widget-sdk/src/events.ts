/**
 * events.ts
 *
 * Every internal SDK event name and its typed payload.
 *
 * Rules:
 *   - All event names are string constants in the WidgetEvent object.
 *   - Every event has a corresponding payload interface.
 *   - The EventPayloadMap maps name → payload for compile-time enforcement.
 *   - No AI, chat, visitor-tracking, or booking events belong here.
 *   - Only runtime lifecycle and module lifecycle events.
 */

// ─── Event name constants ─────────────────────────────────────────────────────

/**
 * All internal SDK event names.
 * Import WidgetEvent.X instead of using raw strings.
 */
export const WidgetEvent = {
  // Runtime lifecycle
  WIDGET_INITIALIZING:  'WIDGET_INITIALIZING',
  WIDGET_READY:         'WIDGET_READY',
  WIDGET_DESTROYED:     'WIDGET_DESTROYED',
  RUNTIME_ERROR:        'RUNTIME_ERROR',

  // Configuration (B.1.3 legacy — kept for backwards compat)
  CONFIG_LOADED:              'CONFIG_LOADED',

  // Configuration pipeline (B.1.4)
  CONFIG_LOADING:             'CONFIG_LOADING',
  CONFIG_RESOLVED:            'CONFIG_RESOLVED',
  CONFIG_UPDATED:             'CONFIG_UPDATED',
  CONFIG_RESET:               'CONFIG_RESET',
  CONFIG_VALIDATION_WARNING:  'CONFIG_VALIDATION_WARNING',

  // DOM root
  ROOT_CREATED:         'ROOT_CREATED',
  ROOT_DESTROYED:       'ROOT_DESTROYED',

  // Module lifecycle
  MODULE_REGISTERED:    'MODULE_REGISTERED',
  MODULE_INITIALIZED:   'MODULE_INITIALIZED',
  MODULE_DESTROYED:     'MODULE_DESTROYED',

  // Transport (B.2.1)
  TRANSPORT_REQUEST:    'TRANSPORT_REQUEST',
  TRANSPORT_RESPONSE:   'TRANSPORT_RESPONSE',
  TRANSPORT_ERROR:      'TRANSPORT_ERROR',

  // Credentials (B.2.3)
  CREDENTIALS_PROVIDER_CHANGED: 'CREDENTIALS_PROVIDER_CHANGED',
  CREDENTIALS_REFRESHED:        'CREDENTIALS_REFRESHED',
  CREDENTIALS_CLEARED:          'CREDENTIALS_CLEARED',

  // Orchestrator (B.2.4)
  REQUEST_QUEUED:    'REQUEST_QUEUED',
  REQUEST_STARTED:   'REQUEST_STARTED',
  REQUEST_COMPLETED: 'REQUEST_COMPLETED',
  REQUEST_CANCELLED: 'REQUEST_CANCELLED',
  QUEUE_CLEARED:     'QUEUE_CLEARED',

  // Retry Engine (B.2.5)
  RETRY_STARTED:   'RETRY_STARTED',
  RETRY_ATTEMPT:   'RETRY_ATTEMPT',
  RETRY_DELAY:     'RETRY_DELAY',
  RETRY_COMPLETED: 'RETRY_COMPLETED',
  RETRY_FAILED:    'RETRY_FAILED',

  // Resilience Layer (B.2.6)
  REQUEST_TIMEOUT:               'REQUEST_TIMEOUT',
  REQUEST_ABORTED:               'REQUEST_ABORTED',
  REQUEST_DEADLINE_EXPIRED:      'REQUEST_DEADLINE_EXPIRED',
  RESILIENCE_CONTEXT_CREATED:    'RESILIENCE_CONTEXT_CREATED',
  RESILIENCE_CONTEXT_DISPOSED:   'RESILIENCE_CONTEXT_DISPOSED',

  // Connectivity Manager (B.2.7)
  CONNECTIVITY_ONLINE:    'CONNECTIVITY_ONLINE',
  CONNECTIVITY_OFFLINE:   'CONNECTIVITY_OFFLINE',
  REQUEST_DEFERRED:       'REQUEST_DEFERRED',
  QUEUE_REPLAY_STARTED:   'QUEUE_REPLAY_STARTED',
  QUEUE_REPLAY_COMPLETED: 'QUEUE_REPLAY_COMPLETED',
  QUEUE_REPLAY_FAILED:    'QUEUE_REPLAY_FAILED',

  // Realtime Layer (B.2.8)
  REALTIME_CONNECTED:    'REALTIME_CONNECTED',
  REALTIME_DISCONNECTED: 'REALTIME_DISCONNECTED',
  REALTIME_RECONNECTING: 'REALTIME_RECONNECTING',
  REALTIME_SUBSCRIBED:   'REALTIME_SUBSCRIBED',
  REALTIME_UNSUBSCRIBED: 'REALTIME_UNSUBSCRIBED',
  REALTIME_MESSAGE:      'REALTIME_MESSAGE',
  HEARTBEAT_SENT:        'HEARTBEAT_SENT',
  HEARTBEAT_RECEIVED:    'HEARTBEAT_RECEIVED',

  // Rendering (C.1)
  RENDERER_MOUNTED:   'RENDERER_MOUNTED',
  RENDERER_UPDATED:   'RENDERER_UPDATED',
  RENDERER_UNMOUNTED: 'RENDERER_UNMOUNTED',
  STYLES_INJECTED:    'STYLES_INJECTED',

  // UI Foundation (C.2)
  THEME_CHANGED:       'THEME_CHANGED',
  LAYOUT_UPDATED:      'LAYOUT_UPDATED',
  RESPONSIVE_CHANGED:  'RESPONSIVE_CHANGED',
  ANIMATION_STARTED:   'ANIMATION_STARTED',
  ANIMATION_COMPLETED: 'ANIMATION_COMPLETED',
  OVERLAY_CREATED:     'OVERLAY_CREATED',
  OVERLAY_REMOVED:     'OVERLAY_REMOVED',
  FOCUS_CHANGED:       'FOCUS_CHANGED',

  // Launcher (C.3)
  LAUNCHER_OPENED:  'LAUNCHER_OPENED',
  LAUNCHER_CLOSED:  'LAUNCHER_CLOSED',
  LAUNCHER_TOGGLED: 'LAUNCHER_TOGGLED',
  LAUNCHER_SHOWN:   'LAUNCHER_SHOWN',
  LAUNCHER_HIDDEN:  'LAUNCHER_HIDDEN',
  BADGE_UPDATED:    'BADGE_UPDATED',

  // Conversation (C.4)
  CONVERSATION_OPENED:   'CONVERSATION_OPENED',
  CONVERSATION_CLOSED:   'CONVERSATION_CLOSED',
  CONVERSATION_MINIMIZED:'CONVERSATION_MINIMIZED',
  CONVERSATION_RESTORED: 'CONVERSATION_RESTORED',
  INPUT_CHANGED:         'INPUT_CHANGED',
  SEND_REQUESTED:        'SEND_REQUESTED',

  // Installation (C.5)
  INSTALL_STARTED:        'INSTALL_STARTED',
  INSTALL_COMPLETED:      'INSTALL_COMPLETED',
  INSTALL_FAILED:         'INSTALL_FAILED',
  UNINSTALL_COMPLETED:    'UNINSTALL_COMPLETED',
  REINSTALL_COMPLETED:    'REINSTALL_COMPLETED',
  COMPATIBILITY_WARNING:  'COMPATIBILITY_WARNING',

  // Dashboard (C.6)
  DASHBOARD_CONNECTED:    'DASHBOARD_CONNECTED',
  CONFIG_SYNC_STARTED:    'CONFIG_SYNC_STARTED',
  CONFIG_SYNC_COMPLETED:  'CONFIG_SYNC_COMPLETED',
  CONFIG_CHANGED:         'CONFIG_CHANGED',
  CONFIG_ROLLBACK:        'CONFIG_ROLLBACK',
} as const;

export type WidgetEventName = typeof WidgetEvent[keyof typeof WidgetEvent];

// ─── Payload interfaces ───────────────────────────────────────────────────────

/** Emitted when the runtime enters INITIALIZING state. */
export interface RuntimeInitializingPayload {
  timestamp: string;
  sdkVersion: string;
}

/** Emitted when the runtime reaches READY state. */
export interface RuntimeReadyPayload {
  timestamp:  string;
  sdkVersion: string;
  businessId: string;
}

/** Emitted when the runtime is destroyed. */
export interface RuntimeDestroyedPayload {
  timestamp:  string;
  sdkVersion: string;
}

/** Emitted when a runtime error occurs. */
export interface RuntimeErrorPayload {
  timestamp: string;
  message:   string;
  /** The state the runtime was in when the error occurred. */
  fromState: string;
}

/** Emitted after configuration is validated and resolved (B.1.3 legacy). */
export interface ConfigurationPayload {
  timestamp:    string;
  businessId:   string;
  position:     string;
  theme:        string;
  primaryColor: string;
}

// ─── B.1.4 Configuration pipeline payloads ───────────────────────────────────

/** Emitted when the configuration pipeline begins loading. */
export interface ConfigLoadingPayload {
  timestamp: string;
  source:    ConfigurationSource;
}

/** Emitted when the configuration is fully resolved and frozen. */
export interface ConfigResolvedPayload {
  timestamp:          string;
  businessId:         string;
  position:           string;
  theme:              string;
  primaryColor:       string;
  source:             ConfigurationSource;
  overrideCount:      number;
  validationWarnings: string[];
  version:            number;
}

/** Emitted when runtime overrides are applied after initial resolution. */
export interface ConfigUpdatedPayload {
  timestamp:     string;
  changedFields: string[];
  version:       number;
}

/** Emitted when the configuration is reset to defaults. */
export interface ConfigResetPayload {
  timestamp: string;
  version:   number;
}

/** Emitted when a non-fatal validation issue is found. */
export interface ConfigValidationWarningPayload {
  timestamp: string;
  field:     string;
  value:     string;
  message:   string;
}

/**
 * Which configuration layer was the primary source for the resolved config.
 * 'defaults'    — only SDK defaults were available
 * 'script'      — script tag attributes were the primary source
 * 'override'    — runtime overrides were applied on top of script attributes
 * 'server'      — future: server-side configuration (stub only)
 */
export type ConfigurationSource = 'defaults' | 'script' | 'override' | 'server';

/** Emitted when the widget root element is appended to the DOM. */
export interface RootPayload {
  timestamp: string;
  elementId: string;
}

/** Emitted for module lifecycle events (registered, initialized, destroyed). */
export interface ModulePayload {
  timestamp: string;
  moduleId:  string;
}

// ─── B.2.1 Transport payloads ─────────────────────────────────────────────────

/** Emitted before a request enters the pipeline. */
export interface TransportRequestPayload {
  timestamp: string;
  requestId: string;
  method:    string;
  url:       string;
}

/** Emitted after a successful response is received. */
export interface TransportResponsePayload {
  timestamp:  string;
  requestId:  string;
  status:     number;
  duration:   number;
}

/** Emitted when the transport pipeline throws an error. */
export interface TransportErrorPayload {
  timestamp:  string;
  requestId:  string;
  errorCode:  string;
  message:    string;
}

// ─── B.2.3 Credentials payloads ───────────────────────────────────────────────

/** Emitted when the active credentials provider is replaced. */
export interface CredentialsProviderChangedPayload {
  timestamp:  string;
  previousId: string;
  currentId:  string;
}

/** Emitted after refreshIfNeeded() completes (success or no-op). */
export interface CredentialsRefreshedPayload {
  timestamp:  string;
  providerId: string;
}

/** Emitted when clearProvider() resets to NullProvider. */
export interface CredentialsClearedPayload {
  timestamp:  string;
  clearedId:  string;
}

// ─── B.2.4 Orchestrator payloads ─────────────────────────────────────────────

/** Emitted when a request is added to the queue. */
export interface RequestQueuedPayload {
  timestamp:   string;
  queueId:     string;
  requestId:   string;
  url:         string;
  method:      string;
  queueLength: number;
}

/** Emitted when the orchestrator begins processing a request. */
export interface RequestStartedPayload {
  timestamp: string;
  queueId:   string;
  requestId: string;
  url:       string;
  method:    string;
}

/** Emitted when a request completes successfully. */
export interface RequestCompletedPayload {
  timestamp: string;
  queueId:   string;
  requestId: string;
  status:    number;
  duration:  number;
  queueTime: number;
}

/** Emitted when a request fails or is cancelled. */
export interface RequestCancelledPayload {
  timestamp: string;
  queueId:   string;
  requestId: string;
  reason:    string;
}

/** Emitted when the queue is cleared via clear(). */
export interface QueueClearedPayload {
  timestamp:      string;
  cancelledCount: number;
}

// ─── B.2.5 Retry Engine payloads ─────────────────────────────────────────────

/** Emitted when a retry sequence begins (before the first attempt). */
export interface RetryStartedPayload {
  timestamp:  string;
  requestId:  string;
  policy:     string;
}

/** Emitted when a retry attempt is about to be made. */
export interface RetryAttemptPayload {
  timestamp:  string;
  requestId:  string;
  attempt:    number;
  delayMs:    number;
  reason:     string;
  errorCode:  string;
}

/** Emitted when the engine is waiting before the next attempt. */
export interface RetryDelayPayload {
  timestamp:  string;
  requestId:  string;
  delayMs:    number;
  attempt:    number;
}

/** Emitted when the sequence ultimately succeeds (possibly after retries). */
export interface RetryCompletedPayload {
  timestamp:  string;
  requestId:  string;
  attempts:   number;
  totalMs:    number;
  success:    boolean;
}

/** Emitted when all retry attempts are exhausted and the request fails. */
export interface RetryFailedPayload {
  timestamp:  string;
  requestId:  string;
  attempts:   number;
  totalMs:    number;
  errorCode:  string;
  reason:     string;
}

// ─── B.2.6 Resilience Layer payloads ────────────────────────────────────────

/** Emitted when a request times out. */
export interface RequestTimeoutPayload {
  timestamp:  string;
  requestId:  string;
  contextId:  string;
  timeoutMs:  number;
}

/** Emitted when a request is aborted via CancellationSource.cancel(). */
export interface RequestAbortedPayload {
  timestamp:  string;
  requestId:  string;
  contextId:  string;
  reason:     string;
}

/** Emitted when a deadline expires before the request completes. */
export interface RequestDeadlineExpiredPayload {
  timestamp:  string;
  requestId:  string;
  contextId:  string;
}

/** Emitted when a ResilienceContext is created for a request. */
export interface ResilienceContextCreatedPayload {
  timestamp:  string;
  contextId:  string;
  requestId:  string;
  timeoutMs:  number;
}

/** Emitted when a ResilienceContext is disposed after request completion. */
export interface ResilienceContextDisposedPayload {
  timestamp:   string;
  contextId:   string;
  requestId:   string;
  lifetimeMs:  number;
}

// ─── B.2.7 Connectivity Manager payloads ─────────────────────────────────────

/** Emitted when the browser comes back online. */
export interface ConnectivityOnlinePayload {
  timestamp:   string;
  queueLength: number;
}

/** Emitted when the browser goes offline. */
export interface ConnectivityOfflinePayload {
  timestamp:   string;
}

/** Emitted when a request is deferred to the offline queue. */
export interface RequestDeferredPayload {
  timestamp:   string;
  requestId:   string;
  entryId:     string;
  queueLength: number;
}

/** Emitted when queue replay begins after reconnection. */
export interface QueueReplayStartedPayload {
  timestamp:   string;
  queueLength: number;
}

/** Emitted when all deferred requests have been replayed successfully. */
export interface QueueReplayCompletedPayload {
  timestamp:        string;
  replayedRequests: number;
}

/** Emitted when queue replay finishes with at least one failure. */
export interface QueueReplayFailedPayload {
  timestamp:        string;
  replayedRequests: number;
  failedRequests:   number;
}

// ─── B.2.8 Realtime Layer payloads ───────────────────────────────────────────

export interface RealtimeConnectedPayload {
  timestamp:      string;
  adapterType:    string;
  reconnectCount: number;
}
export interface RealtimeDisconnectedPayload {
  timestamp:   string;
  adapterType: string;
  reason:      string;
}
export interface RealtimeReconnectingPayload {
  timestamp: string;
  attempt:   number;
  delayMs:   number;
}
export interface RealtimeSubscribedPayload {
  timestamp:      string;
  channel:        string;
  subscriptionId: string;
}
export interface RealtimeUnsubscribedPayload {
  timestamp:      string;
  channel:        string;
  subscriptionId: string;
}
export interface RealtimeMessagePayload {
  timestamp: string;
  channel:   string;
  event:     string;
  messageId: string;
}
export interface HeartbeatSentPayload {
  timestamp: string;
  count:     number;
}
export interface HeartbeatReceivedPayload {
  timestamp: string;
  count:     number;
}

// ─── C.1 Rendering payloads ───────────────────────────────────────────────────

export interface RendererMountedPayload {
  timestamp:  string;
  elementId:  string;
  shadowDOM:  boolean;
}
export interface RendererUpdatedPayload {
  timestamp: string;
  changes:   string[];
}
export interface RendererUnmountedPayload {
  timestamp: string;
  elementId: string;
}
export interface StylesInjectedPayload {
  timestamp:  string;
  styleType:  string;
}

// ─── C.2 UI Foundation payloads ───────────────────────────────────────────────

export interface ThemeChangedPayload       { timestamp: string; mode: string; resolved: string; }
export interface LayoutUpdatedPayload      { timestamp: string; layout: string; }
export interface ResponsiveChangedPayload  { timestamp: string; breakpoint: string; width: number; height: number; }
export interface AnimationStartedPayload   { timestamp: string; animId: string; type: string; direction: string; }
export interface AnimationCompletedPayload { timestamp: string; animId: string; type: string; }
export interface OverlayCreatedPayload     { timestamp: string; overlayId: string; type: string; zIndex: number; }
export interface OverlayRemovedPayload     { timestamp: string; overlayId: string; }
export interface FocusChangedPayload       { timestamp: string; trapped: boolean; }

// ─── C.3 Launcher payloads ───────────────────────────────────────────────────

export interface LauncherOpenedPayload  { timestamp: string; position: string; }
export interface LauncherClosedPayload  { timestamp: string; position: string; }
export interface LauncherToggledPayload { timestamp: string; isOpen: boolean; }
export interface LauncherShownPayload   { timestamp: string; }
export interface LauncherHiddenPayload  { timestamp: string; }
export interface BadgeUpdatedPayload    { timestamp: string; type: string; count: number; visible: boolean; }

// ─── C.4 Conversation payloads ────────────────────────────────────────────────

export interface ConversationOpenedPayload   { timestamp: string; }
export interface ConversationClosedPayload   { timestamp: string; }
export interface ConversationMinimizedPayload{ timestamp: string; }
export interface ConversationRestoredPayload { timestamp: string; }
export interface InputChangedPayload         { timestamp: string; length: number; }
export interface SendRequestedPayload        { timestamp: string; length: number; }

// ─── C.5 Installation payloads ────────────────────────────────────────────────

export interface InstallStartedPayload {
  timestamp: string;
  embedMode: string;
}
export interface InstallCompletedPayload {
  timestamp:  string;
  embedMode:  string;
  businessId: string;
}
export interface InstallFailedPayload {
  timestamp: string;
  reason:    string;
  error:     string;
}
export interface UninstallCompletedPayload {
  timestamp: string;
}
export interface ReinstallCompletedPayload {
  timestamp:      string;
  embedMode:      string;
  reinstallCount: number;
}
export interface CompatibilityWarningPayload {
  timestamp:    string;
  message:      string;
  capabilities: import('./integration/types').BrowserCapabilities;
}

// ─── C.6 Dashboard payloads ───────────────────────────────────────────────────

export interface DashboardConnectedPayload {
  timestamp: string;
  version:   number;
}
export interface ConfigSyncStartedPayload {
  timestamp: string;
  version:   number;
}
export interface ConfigSyncCompletedPayload {
  timestamp:     string;
  version:       number;
  changedFields: string[];
}
export interface ConfigChangedPayload {
  timestamp:     string;
  version:       number;
  changedFields: string[];
  diff:          Array<{ field: string; previous: string | null; current: string }>;
}
export interface ConfigRollbackPayload {
  timestamp: string;
  version:   number;
}

// ─── Event → Payload mapping ──────────────────────────────────────────────────

/**
 * Maps every event name to its payload type.
 * The EventBus uses this map to enforce that emit() and on() receive the
 * correct payload type for each event at compile time.
 */
export interface EventPayloadMap {
  [WidgetEvent.WIDGET_INITIALIZING]: RuntimeInitializingPayload;
  [WidgetEvent.WIDGET_READY]:        RuntimeReadyPayload;
  [WidgetEvent.WIDGET_DESTROYED]:    RuntimeDestroyedPayload;
  [WidgetEvent.RUNTIME_ERROR]:       RuntimeErrorPayload;
  [WidgetEvent.CONFIG_LOADED]:       ConfigurationPayload;
  // B.1.4 configuration events
  [WidgetEvent.CONFIG_LOADING]:            ConfigLoadingPayload;
  [WidgetEvent.CONFIG_RESOLVED]:           ConfigResolvedPayload;
  [WidgetEvent.CONFIG_UPDATED]:            ConfigUpdatedPayload;
  [WidgetEvent.CONFIG_RESET]:              ConfigResetPayload;
  [WidgetEvent.CONFIG_VALIDATION_WARNING]: ConfigValidationWarningPayload;
  [WidgetEvent.ROOT_CREATED]:        RootPayload;
  [WidgetEvent.ROOT_DESTROYED]:      RootPayload;
  [WidgetEvent.MODULE_REGISTERED]:   ModulePayload;
  [WidgetEvent.MODULE_INITIALIZED]:  ModulePayload;
  [WidgetEvent.MODULE_DESTROYED]:    ModulePayload;
  // B.2.1 transport events
  [WidgetEvent.TRANSPORT_REQUEST]:   TransportRequestPayload;
  [WidgetEvent.TRANSPORT_RESPONSE]:  TransportResponsePayload;
  [WidgetEvent.TRANSPORT_ERROR]:     TransportErrorPayload;
  // B.2.3 credentials events
  [WidgetEvent.CREDENTIALS_PROVIDER_CHANGED]: CredentialsProviderChangedPayload;
  [WidgetEvent.CREDENTIALS_REFRESHED]:        CredentialsRefreshedPayload;
  [WidgetEvent.CREDENTIALS_CLEARED]:          CredentialsClearedPayload;
  // B.2.4 orchestrator events
  [WidgetEvent.REQUEST_QUEUED]:    RequestQueuedPayload;
  [WidgetEvent.REQUEST_STARTED]:   RequestStartedPayload;
  [WidgetEvent.REQUEST_COMPLETED]: RequestCompletedPayload;
  [WidgetEvent.REQUEST_CANCELLED]: RequestCancelledPayload;
  [WidgetEvent.QUEUE_CLEARED]:     QueueClearedPayload;
  // B.2.5 retry events
  [WidgetEvent.RETRY_STARTED]:   RetryStartedPayload;
  [WidgetEvent.RETRY_ATTEMPT]:   RetryAttemptPayload;
  [WidgetEvent.RETRY_DELAY]:     RetryDelayPayload;
  [WidgetEvent.RETRY_COMPLETED]: RetryCompletedPayload;
  [WidgetEvent.RETRY_FAILED]:    RetryFailedPayload;
  // B.2.6 resilience events
  [WidgetEvent.REQUEST_TIMEOUT]:             RequestTimeoutPayload;
  [WidgetEvent.REQUEST_ABORTED]:             RequestAbortedPayload;
  [WidgetEvent.REQUEST_DEADLINE_EXPIRED]:    RequestDeadlineExpiredPayload;
  [WidgetEvent.RESILIENCE_CONTEXT_CREATED]:  ResilienceContextCreatedPayload;
  [WidgetEvent.RESILIENCE_CONTEXT_DISPOSED]: ResilienceContextDisposedPayload;
  // B.2.7 connectivity events
  [WidgetEvent.CONNECTIVITY_ONLINE]:    ConnectivityOnlinePayload;
  [WidgetEvent.CONNECTIVITY_OFFLINE]:   ConnectivityOfflinePayload;
  [WidgetEvent.REQUEST_DEFERRED]:       RequestDeferredPayload;
  [WidgetEvent.QUEUE_REPLAY_STARTED]:   QueueReplayStartedPayload;
  [WidgetEvent.QUEUE_REPLAY_COMPLETED]: QueueReplayCompletedPayload;
  [WidgetEvent.QUEUE_REPLAY_FAILED]:    QueueReplayFailedPayload;
  // B.2.8 realtime events
  [WidgetEvent.REALTIME_CONNECTED]:    RealtimeConnectedPayload;
  [WidgetEvent.REALTIME_DISCONNECTED]: RealtimeDisconnectedPayload;
  [WidgetEvent.REALTIME_RECONNECTING]: RealtimeReconnectingPayload;
  [WidgetEvent.REALTIME_SUBSCRIBED]:   RealtimeSubscribedPayload;
  [WidgetEvent.REALTIME_UNSUBSCRIBED]: RealtimeUnsubscribedPayload;
  [WidgetEvent.REALTIME_MESSAGE]:      RealtimeMessagePayload;
  [WidgetEvent.HEARTBEAT_SENT]:        HeartbeatSentPayload;
  [WidgetEvent.HEARTBEAT_RECEIVED]:    HeartbeatReceivedPayload;
  // C.1 rendering events
  [WidgetEvent.RENDERER_MOUNTED]:   RendererMountedPayload;
  [WidgetEvent.RENDERER_UPDATED]:   RendererUpdatedPayload;
  [WidgetEvent.RENDERER_UNMOUNTED]: RendererUnmountedPayload;
  [WidgetEvent.STYLES_INJECTED]:    StylesInjectedPayload;
  // C.2 UI Foundation events
  [WidgetEvent.THEME_CHANGED]:       ThemeChangedPayload;
  [WidgetEvent.LAYOUT_UPDATED]:      LayoutUpdatedPayload;
  [WidgetEvent.RESPONSIVE_CHANGED]:  ResponsiveChangedPayload;
  [WidgetEvent.ANIMATION_STARTED]:   AnimationStartedPayload;
  [WidgetEvent.ANIMATION_COMPLETED]: AnimationCompletedPayload;
  [WidgetEvent.OVERLAY_CREATED]:     OverlayCreatedPayload;
  [WidgetEvent.OVERLAY_REMOVED]:     OverlayRemovedPayload;
  [WidgetEvent.FOCUS_CHANGED]:       FocusChangedPayload;
  // C.3 launcher events
  [WidgetEvent.LAUNCHER_OPENED]:  LauncherOpenedPayload;
  [WidgetEvent.LAUNCHER_CLOSED]:  LauncherClosedPayload;
  [WidgetEvent.LAUNCHER_TOGGLED]: LauncherToggledPayload;
  [WidgetEvent.LAUNCHER_SHOWN]:   LauncherShownPayload;
  [WidgetEvent.LAUNCHER_HIDDEN]:  LauncherHiddenPayload;
  [WidgetEvent.BADGE_UPDATED]:    BadgeUpdatedPayload;
  // C.4 conversation events
  [WidgetEvent.CONVERSATION_OPENED]:    ConversationOpenedPayload;
  [WidgetEvent.CONVERSATION_CLOSED]:    ConversationClosedPayload;
  [WidgetEvent.CONVERSATION_MINIMIZED]: ConversationMinimizedPayload;
  [WidgetEvent.CONVERSATION_RESTORED]:  ConversationRestoredPayload;
  [WidgetEvent.INPUT_CHANGED]:          InputChangedPayload;
  [WidgetEvent.SEND_REQUESTED]:         SendRequestedPayload;
  // C.5 installation events
  [WidgetEvent.INSTALL_STARTED]:       InstallStartedPayload;
  [WidgetEvent.INSTALL_COMPLETED]:     InstallCompletedPayload;
  [WidgetEvent.INSTALL_FAILED]:        InstallFailedPayload;
  [WidgetEvent.UNINSTALL_COMPLETED]:   UninstallCompletedPayload;
  [WidgetEvent.REINSTALL_COMPLETED]:   ReinstallCompletedPayload;
  [WidgetEvent.COMPATIBILITY_WARNING]: CompatibilityWarningPayload;
  // C.6 dashboard events
  [WidgetEvent.DASHBOARD_CONNECTED]:   DashboardConnectedPayload;
  [WidgetEvent.CONFIG_SYNC_STARTED]:   ConfigSyncStartedPayload;
  [WidgetEvent.CONFIG_SYNC_COMPLETED]: ConfigSyncCompletedPayload;
  [WidgetEvent.CONFIG_CHANGED]:        ConfigChangedPayload;
  [WidgetEvent.CONFIG_ROLLBACK]:       ConfigRollbackPayload;
}
