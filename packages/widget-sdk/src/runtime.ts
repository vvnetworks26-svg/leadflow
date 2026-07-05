/**
 * runtime.ts
 *
 * The singleton runtime object and its lifecycle state machine.
 *
 * B.1.4: runtime now owns a ConfigurationService instance.
 *
 * Ownership:
 *   runtime
 *     ├── eventBus       (IEventBus singleton)
 *     ├── configuration  (ConfigurationService instance)
 *     └── status / config / rootElement / ...
 */

import { RuntimeState, LOG_PREFIX }      from './constants';
import { eventBus }                      from './eventBus';
import { createConfigurationService }    from './configuration/service';
import { createTransportClient }         from './transport/client';
import { createCredentialsManager }      from './auth/manager';
import { createOrchestrator }            from './orchestrator/orchestrator';
import { createRetryEngine }             from './retry/engine';
import { createResilienceManager }       from './resilience/manager';
import { createConnectivityManager }     from './connectivity/manager';
import { createRealtimeManager }         from './realtime/manager';
import { createRenderer }                from './rendering/renderer';
import { createUIFoundation }            from './ui/foundation';
import type { IRequestOrchestrator }     from './orchestrator/types';
import type { IRetryEngine }             from './retry/types';
import type { IResilienceManager }       from './resilience/types';
import type { IConnectivityManager }     from './connectivity/types';
import type { IRealtimeManager }         from './realtime/types';
import type { WidgetRuntime, WidgetConfig, RuntimeStatus } from './types';

// ─── Valid state transitions ──────────────────────────────────────────────────

const TRANSITIONS: Readonly<Record<RuntimeStatus, ReadonlyArray<RuntimeStatus>>> = {
  [RuntimeState.UNINITIALIZED]: [RuntimeState.INITIALIZING],
  [RuntimeState.INITIALIZING]:  [RuntimeState.READY, RuntimeState.ERROR],
  [RuntimeState.READY]:         [RuntimeState.DESTROYED, RuntimeState.ERROR],
  [RuntimeState.DESTROYED]:     [RuntimeState.INITIALIZING, RuntimeState.DESTROYED],
  [RuntimeState.ERROR]:         [RuntimeState.INITIALIZING],
};

// ─── Singleton runtime object ─────────────────────────────────────────────────

export const runtime: WidgetRuntime = {
  status:        RuntimeState.UNINITIALIZED,
  config:        null,
  rootElement:   null,
  initializedAt: null,
  sdkVersion:    typeof __SDK_VERSION__ !== 'undefined' ? __SDK_VERSION__ : '0.0.0',
  lastError:     null,
  eventBus,
  configuration: createConfigurationService(),
  transport:     createTransportClient(),
  credentials:   createCredentialsManager(),
  orchestrator:  null as never,
  retryEngine:   null as never,
  resilience:    null as never,
  connectivity:  null as never,
  realtime:      null as never,
  renderer:      createRenderer(),
  ui:            createUIFoundation(),
  launcher:      null,   // created by loader after renderer mounts
  conversation:  null,   // created by loader after renderer mounts
  installation:  null,   // created by loader after auto-init
};

// Wire credential headers into transport (avoids circular import)
(runtime.transport as unknown as {
  setCredentialHeadersGetter(g: () => Readonly<Record<string, string>>): void
}).setCredentialHeadersGetter(() => runtime.credentials.getHeaders());

// Create the resilience manager (default timeout = 0, i.e. no timeout unless overridden)
(runtime as unknown as { resilience: IResilienceManager }).resilience =
  createResilienceManager(0);

// Create the retry engine
(runtime as unknown as { retryEngine: IRetryEngine }).retryEngine =
  createRetryEngine();

// Create orchestrator:
//   submit → retryEngine.execute()
//     → retryEngine calls resilienceManager.wrapRequest() for each attempt
//       → injects AbortSignal, manages timeout/cancellation
//         → transport.send()
(runtime as unknown as { orchestrator: IRequestOrchestrator }).orchestrator =
  createOrchestrator({
    send: <T>(req: import('./transport/types').TransportRequest) =>
      runtime.retryEngine.execute<T>(
        req,
        (r) => runtime.resilience.wrapRequest<T>(r, (wrapped) => runtime.transport.send<T>(wrapped))
      ),
    use:              runtime.transport.use.bind(runtime.transport),
    clearMiddleware:  runtime.transport.clearMiddleware.bind(runtime.transport),
    setAdapter:       runtime.transport.setAdapter.bind(runtime.transport),
    getAdapter:       runtime.transport.getAdapter.bind(runtime.transport),
    middlewareCount:  runtime.transport.middlewareCount.bind(runtime.transport),
  });

// Create connectivity manager — wraps the orchestrator.
(runtime as unknown as { connectivity: IConnectivityManager }).connectivity =
  createConnectivityManager(runtime.orchestrator);

// Create realtime manager with default mock adapter.
(runtime as unknown as { realtime: IRealtimeManager }).realtime =
  createRealtimeManager();

// ─── State machine ────────────────────────────────────────────────────────────

export function transitionTo(to: RuntimeStatus): void {
  const from    = runtime.status;
  if (from === to) return; // same-state: no-op
  const allowed = TRANSITIONS[from];

  if (!allowed.includes(to)) {
    const msg =
      `${LOG_PREFIX} Illegal state transition: ${from} → ${to}. ` +
      `Allowed from ${from}: [${allowed.join(', ')}]`;
    console.error(msg);
    throw new Error(msg);
  }

  runtime.status = to;
}

// ─── Field update helpers ─────────────────────────────────────────────────────

export function recordReady(
  config:      WidgetConfig,
  rootElement: HTMLDivElement
): void {
  runtime.config        = config;
  runtime.rootElement   = rootElement;
  runtime.initializedAt = new Date().toISOString();
  runtime.lastError     = null;
}

export function recordError(message: string): void {
  runtime.lastError   = message;
  runtime.rootElement = null;
}

export function resetRuntime(): void {
  // config is intentionally preserved so reinstall() can reuse it after destroy.
  // rootElement, initializedAt, and lastError are cleared.
  runtime.rootElement   = null;
  runtime.initializedAt = null;
  runtime.lastError     = null;
  // ConfigurationService is NOT reset here — it survives the lifecycle
  // to preserve the script-layer config for re-init.
}
