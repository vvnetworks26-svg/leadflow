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
}
