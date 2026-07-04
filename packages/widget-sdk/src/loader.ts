/**
 * loader.ts
 *
 * Widget initialization and destruction entry points.
 *
 * B.1.4: Initialization now routes through the Configuration Service.
 * The config pipeline runs before DOM work begins.
 */

import { mountRoot, WIDGET_ROOT_ID }    from './bootstrap';
import {
  runtime,
  transitionTo,
  recordReady,
  recordError,
  resetRuntime,
}                                        from './runtime';
import { RuntimeState, LOG_PREFIX }      from './constants';
import { eventBus }                      from './eventBus';
import { WidgetEvent }                   from './events';
import { registry }                      from './registry';
import { hooks }                         from './hooks';
import type { WidgetConfig, InitializationStatus } from './types';

// ─── DOM readiness ────────────────────────────────────────────────────────────

function whenDomReady(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
    } else {
      resolve();
    }
  });
}

function isAlreadyMounted(): boolean {
  return document.getElementById(WIDGET_ROOT_ID) !== null;
}

// ─── Initialize ───────────────────────────────────────────────────────────────

export async function initializeWidget(
  config: WidgetConfig
): Promise<InitializationStatus> {

  if (
    runtime.status === RuntimeState.INITIALIZING ||
    runtime.status === RuntimeState.READY
  ) {
    console.warn(
      `${LOG_PREFIX} Widget already ${runtime.status.toLowerCase()} — ` +
      `skipping duplicate initialization.`
    );
    return 'already-initialized';
  }

  // ── Hook: beforeInitialize ────────────────────────────────────────────────
  hooks.run('beforeInitialize');

  // ── Transition: → INITIALIZING ───────────────────────────────────────────
  try {
    transitionTo(RuntimeState.INITIALIZING);
  } catch {
    return 'error';
  }

  eventBus.emit(WidgetEvent.WIDGET_INITIALIZING, {
    timestamp:  new Date().toISOString(),
    sdkVersion: runtime.sdkVersion,
  });

  // ── Configuration pipeline (B.1.4) ───────────────────────────────────────
  // Load the supplied config as Layer 3 runtime overrides, then resolve.
  // This ensures the Configuration Service is the authority for all values.
  runtime.configuration.load({
    businessId:   config.businessId,
    position:     config.position,
    theme:        config.theme,
    primaryColor: config.primaryColor,
  });

  const resolvedConfig = runtime.configuration.resolve();
  if (!resolvedConfig) {
    const msg = 'Configuration resolution failed — businessId is required.';
    console.error(`${LOG_PREFIX} ${msg}`);
    recordError(msg);
    transitionTo(RuntimeState.ERROR);
    return 'error';
  }

  // Backwards compat: also emit the B.1.3 CONFIG_LOADED event
  eventBus.emit(WidgetEvent.CONFIG_LOADED, {
    timestamp:    new Date().toISOString(),
    businessId:   resolvedConfig.businessId,
    position:     resolvedConfig.position,
    theme:        resolvedConfig.theme,
    primaryColor: resolvedConfig.primaryColor,
  });

  // ── Wait for DOM ──────────────────────────────────────────────────────────
  await whenDomReady();

  // ── DOM presence guard ────────────────────────────────────────────────────
  if (isAlreadyMounted()) {
    console.warn(
      `${LOG_PREFIX} Widget root element already exists in the DOM — ` +
      `skipping duplicate mount.`
    );
    runtime.status = RuntimeState.READY;
    return 'already-initialized';
  }

  // ── Mount + record + transition: → READY ─────────────────────────────────
  try {
    const root = mountRoot(resolvedConfig);

    eventBus.emit(WidgetEvent.ROOT_CREATED, {
      timestamp: new Date().toISOString(),
      elementId: root.id,
    });

    recordReady(resolvedConfig, root);
    transitionTo(RuntimeState.READY);

    eventBus.emit(WidgetEvent.WIDGET_READY, {
      timestamp:  runtime.initializedAt!,
      sdkVersion: runtime.sdkVersion,
      businessId: resolvedConfig.businessId,
    });

    registry.initializeAll(resolvedConfig);
    hooks.run('afterInitialize');

    return 'mounted';

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${LOG_PREFIX} Failed to mount widget root:`, err);

    eventBus.emit(WidgetEvent.RUNTIME_ERROR, {
      timestamp: new Date().toISOString(),
      message:   msg,
      fromState: RuntimeState.INITIALIZING,
    });

    recordError(msg);
    transitionTo(RuntimeState.ERROR);
    return 'error';
  }
}

// ─── Destroy ──────────────────────────────────────────────────────────────────

export function destroyWidget(): void {
  if (runtime.status !== RuntimeState.READY) {
    console.warn(
      `${LOG_PREFIX} destroy() called when status is ${runtime.status} — no-op.`
    );
    return;
  }

  hooks.run('beforeDestroy');
  registry.destroyAll(runtime.config);

  const root = runtime.rootElement;
  if (root && root.parentNode) {
    root.parentNode.removeChild(root);
  }

  eventBus.emit(WidgetEvent.ROOT_DESTROYED, {
    timestamp: new Date().toISOString(),
    elementId: WIDGET_ROOT_ID,
  });

  resetRuntime();
  transitionTo(RuntimeState.DESTROYED);

  eventBus.emit(WidgetEvent.WIDGET_DESTROYED, {
    timestamp:  new Date().toISOString(),
    sdkVersion: runtime.sdkVersion,
  });

  hooks.run('afterDestroy');
  eventBus.clear();
  hooks.clear();
}
