/**
 * diagnostics.ts — Runtime diagnostics snapshot.
 * B.1.4: Extended with Configuration Service metadata.
 */

import { runtime }   from './runtime';
import { eventBus }  from './eventBus';
import { registry }  from './registry';
import { ROOT_ID }   from './constants';
import type { DiagnosticsInfo } from './types';
import type { TransportDiagnostics } from './transport/client';
import type { FetchAdapterDiagnostics } from './transport/adapters/fetch';

function inferBrowser(ua: string): string {
  if (/Edg\//i.test(ua))     return 'Edge';
  if (/OPR\//i.test(ua))     return 'Opera';
  if (/Chrome\//i.test(ua))  return 'Chrome';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  if (/Safari\//i.test(ua))  return 'Safari';
  return 'Unknown';
}

// ─── Event counter ────────────────────────────────────────────────────────────

let _eventCount = 0;

export function wireEventCounter(): void {
  const originalEmit = eventBus.emit.bind(eventBus);
  (eventBus as unknown as Record<string, unknown>)['emit'] = function <
    E extends Parameters<typeof originalEmit>[0]
  >(event: E, payload: Parameters<typeof originalEmit<E>>[1]) {
    _eventCount++;
    return originalEmit(event, payload);
  };
}

export function resetEventCounter(): void {
  _eventCount = 0;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getDiagnostics(): DiagnosticsInfo {
  const ua          = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const environment = typeof window    !== 'undefined' ? 'browser' : 'unknown';
  const rootMounted = typeof document  !== 'undefined'
    ? document.getElementById(ROOT_ID) !== null
    : false;

  const cfg = runtime.configuration;

  return {
    // B.1.2
    initializedAt:    runtime.initializedAt,
    sdkVersion:       runtime.sdkVersion,
    widgetVersion:    runtime.sdkVersion,
    browser:          inferBrowser(ua),
    userAgent:        ua,
    environment,
    rootMounted,
    status:           runtime.status,
    businessId:       runtime.config?.businessId ?? null,

    // B.1.3
    registeredModules: registry.getAll().map(m => m.id),
    listenerCount:     eventBus.listenerCount(),
    lastEvent:         eventBus.lastEvent(),
    eventHistorySize:  _eventCount,
    runtimeStatus:     runtime.status,

    // B.1.4
    configurationSource:  cfg.getSource(),
    resolvedConfig:       cfg.getResolvedConfig(),
    overrideCount:        cfg.overrideCount(),
    validationWarnings:   cfg.getValidationWarnings(),
    configurationVersion: cfg.getVersion(),

    // B.2.1 — cast to access diagnostics sub-object
    transportAdapter:    runtime.transport.getAdapter().name,
    middlewareCount:     runtime.transport.middlewareCount(),
    lastRequestDuration: (runtime.transport as unknown as { diagnostics: TransportDiagnostics }).diagnostics.lastRequestDuration,
    lastTransportError:  (runtime.transport as unknown as { diagnostics: TransportDiagnostics }).diagnostics.lastTransportError,

    // B.2.2 — fetch adapter diagnostics (null when mock adapter is active)
    ...(() => {
      const adapter = runtime.transport.getAdapter();
      const fetchDiag = (adapter as unknown as { diagnostics?: FetchAdapterDiagnostics }).diagnostics;
      return {
        lastFetchDuration: fetchDiag?.lastFetchDuration  ?? null,
        lastStatusCode:    fetchDiag?.lastStatusCode     ?? null,
        lastResponseSize:  fetchDiag?.lastResponseSize   ?? null,
      };
    })(),

    // B.2.3
    ...(() => {
      const cred = runtime.credentials.getDiagnostics();
      return {
        credentialsProviderId:    cred.providerId,
        credentialsAuthenticated: cred.authenticated,
        credentialsHeaderCount:   cred.headerCount,
        credentialsLastRefresh:   cred.lastRefresh,
      };
    })(),

    // B.2.4
    ...(() => {
      const orch = runtime.orchestrator.getDiagnostics();
      return {
        queueLength:        orch.queueLength,
        processedRequests:  orch.processedRequests,
        pendingRequests:    orch.pendingRequests,
        orchestratorPaused: orch.paused,
        schedulerType:      orch.schedulerType,
        averageQueueTime:   orch.averageQueueTime,
      };
    })(),

    // B.2.5
    ...(() => {
      const retry = runtime.retryEngine.getDiagnostics();
      return {
        totalRetries:      retry.totalRetries,
        successfulRetries: retry.successfulRetries,
        failedRetries:     retry.failedRetries,
        averageAttempts:   retry.averageAttempts,
        lastRetryDelay:    retry.lastRetryDelay,
        activeRetryPolicy: retry.activePolicy,
      };
    })(),

    // B.2.6
    ...(() => {
      const res = runtime.resilience.getDiagnostics();
      return {
        activeResilienceContexts: res.activeContexts,
        timeoutsTriggered:        res.timeoutsTriggered,
        deadlinesExpired:         res.deadlinesExpired,
        cancelledRequests:        res.cancelledRequests,
        averageContextLifetime:   res.averageLifetime,
      };
    })(),

    // B.2.7
    ...(() => {
      const conn = runtime.connectivity.getDiagnostics();
      return {
        connectivityOnline:  conn.online,
        offlineQueueLength:  conn.offlineQueueLength,
        deferredRequests:    conn.deferredRequests,
        replayedRequests:    conn.replayedRequests,
        failedReplays:       conn.failedReplays,
        lastReconnect:       conn.lastReconnect,
      };
    })(),

    // B.2.8
    ...(() => {
      const rt = runtime.realtime.getDiagnostics();
      return {
        realtimeStatus:         rt.connectionStatus,
        realtimeConnectedAt:    rt.connectedAt,
        realtimeReconnectCount: rt.reconnectCount,
        realtimeHeartbeatCount: rt.heartbeatCount,
        realtimeSubscriptions:  rt.subscriptions,
        realtimeAdapterType:    rt.adapterType,
      };
    })(),

    // C.1
    ...(() => {
      const rd = (runtime.renderer as unknown as {
        getDiagnostics(): import('./rendering/types').RenderDiagnostics
      }).getDiagnostics();
      return {
        rendererMounted:        rd.mounted,
        rendererShadowDOM:      rd.shadowDOM,
        rendererContainerReady: rd.containerReady,
        rendererStylesInjected: rd.stylesInjected,
        rendererRenderCount:    rd.renderCount,
      };
    })(),

    // C.2
    ...(() => {
      const ui = runtime.ui.getDiagnostics();
      return {
        activeTheme:      ui.activeTheme,
        themeMode:        ui.themeMode,
        overlayCount:     ui.overlayCount,
        activeAnimations: ui.activeAnimations,
        viewport:         ui.viewport,
        componentCount:   ui.componentCount,
      };
    })(),

    // C.3
    ...(() => {
      const ld = runtime.launcher?.getDiagnostics();
      return {
        launcherVisible:     ld?.launcherVisible     ?? false,
        launcherEnabled:     ld?.launcherEnabled     ?? false,
        launcherOpen:        ld?.launcherOpen        ?? false,
        launcherPosition:    ld?.launcherPosition    ?? 'none',
        badgeCount:          ld?.badgeCount          ?? 0,
        launcherToggleCount: ld?.toggleCount         ?? 0,
      };
    })(),

    // C.4
    ...(() => {
      const cd = runtime.conversation?.getDiagnostics();
      return {
        conversationVisible: cd?.conversationVisible ?? false,
        conversationState:   cd?.conversationState   ?? 'closed',
        inputLength:         cd?.inputLength         ?? 0,
        messageCount:        cd?.messageCount        ?? 0,
        minimized:           cd?.minimized           ?? false,
        fullscreen:          cd?.fullscreen          ?? false,
      };
    })(),
  };
}
