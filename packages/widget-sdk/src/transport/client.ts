/**
 * transport/client.ts
 *
 * The singleton transport client.
 *
 * The client is the only public entry point for the transport layer.
 * It owns:
 *   - The active adapter (default: MockAdapter)
 *   - The middleware stack
 *
 * The client emits TRANSPORT_REQUEST, TRANSPORT_RESPONSE, and TRANSPORT_ERROR
 * events through the shared event bus so other SDK layers can observe traffic.
 *
 * Rules:
 *   - No networking code here — that lives in adapters.
 *   - No business logic — just orchestration.
 *   - The client is created by createTransportClient() and stored on the runtime.
 */

import { runPipeline }          from './pipeline';
import { mockAdapter }          from './adapters/mock';
import { isTransportError }     from './errors';
import { eventBus }             from '../eventBus';
import { WidgetEvent }          from '../events';
import { withHeaders }          from './request';
import type {
  TransportClient,
  TransportAdapter,
  TransportMiddleware,
  TransportRequest,
  TransportResponse,
} from './types';

// ─── Diagnostics state ────────────────────────────────────────────────────────

/** Shared mutable diagnostics — read by diagnostics.ts. */
export interface TransportDiagnostics {
  lastRequestDuration:  number | null;
  lastTransportError:   string | null;
  requestCount:         number;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Optional getter injected by runtime.ts after construction.
 * Avoids circular import: client → runtime → client.
 * Returns credential headers to merge before every request.
 */
type CredentialHeadersGetter = () => Readonly<Record<string, string>>;

export function createTransportClient(): TransportClient & {
  diagnostics: TransportDiagnostics;
  setCredentialHeadersGetter(getter: CredentialHeadersGetter): void;
} {
  let _adapter:     TransportAdapter        = mockAdapter;
  const _middlewares: TransportMiddleware[] = [];
  let _credGetter:  CredentialHeadersGetter | null = null;

  const _diag: TransportDiagnostics = {
    lastRequestDuration: null,
    lastTransportError:  null,
    requestCount:        0,
  };

  const client = {
    diagnostics: _diag,

    /** Called once by runtime.ts to wire credential header injection. */
    setCredentialHeadersGetter(getter: CredentialHeadersGetter): void {
      _credGetter = getter;
    },

    async send<T>(request: TransportRequest): Promise<TransportResponse<T>> {
      _diag.requestCount++;

      // Merge credential headers — request-level headers take precedence
      const credHeaders = _credGetter ? _credGetter() : {};
      const requestWithCreds = Object.keys(credHeaders).length > 0
        ? withHeaders(request, { ...credHeaders, ...request.headers })
        : request;

      // Emit TRANSPORT_REQUEST before pipeline runs
      eventBus.emit(WidgetEvent.TRANSPORT_REQUEST, {
        timestamp: new Date().toISOString(),
        requestId: request.id,
        method:    request.method,
        url:       request.url,
      });

      try {
        const response = await runPipeline<T>(requestWithCreds, _adapter, _middlewares);

        _diag.lastRequestDuration = response.duration;
        _diag.lastTransportError  = null;

        eventBus.emit(WidgetEvent.TRANSPORT_RESPONSE, {
          timestamp:  new Date().toISOString(),
          requestId:  request.id,
          status:     response.status,
          duration:   response.duration,
        });

        return response;

      } catch (err) {
        const msg = isTransportError(err)
          ? `${err.code}: ${err.message}`
          : String(err);

        _diag.lastTransportError  = msg;
        _diag.lastRequestDuration = null;

        eventBus.emit(WidgetEvent.TRANSPORT_ERROR, {
          timestamp:  new Date().toISOString(),
          requestId:  request.id,
          errorCode:  isTransportError(err) ? err.code : 'TRANSPORT_ERROR',
          message:    msg,
        });

        throw err;
      }
    },

    use(middleware: TransportMiddleware): void {
      _middlewares.push(middleware);
    },

    clearMiddleware(): void {
      _middlewares.length = 0;
    },

    setAdapter(adapter: TransportAdapter): void {
      _adapter = adapter;
    },

    getAdapter(): TransportAdapter {
      return _adapter;
    },

    middlewareCount(): number {
      return _middlewares.length;
    },
  };

  return client;
}
