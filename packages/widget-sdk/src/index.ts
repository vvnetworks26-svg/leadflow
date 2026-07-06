/**
 * index.ts — LeadFlow Widget SDK entry point.
 * B.1.4: Adds configuration service API to window.__LEADFLOW__.
 */

import { parseScriptAttributes, parseConfig } from './config';
import { initializeWidget, destroyWidget }     from './loader';
import { getDiagnostics, wireEventCounter }    from './diagnostics';
import { runtime }                             from './runtime';
import { eventBus }                            from './eventBus';
import { registry }                            from './registry';
import { LOG_PREFIX, WINDOW_GLOBAL }           from './constants';
import { createIntegrationManager }            from './integration/loader';
import type { LeadFlowSDK, WidgetConfig, InitializationStatus } from './types';
import type { IWidgetModule }                  from './module';
import type { TransportAdapter }               from './transport/types';
import type { CredentialsProvider }            from './auth/types';

wireEventCounter();

const sdk: LeadFlowSDK = {
  initialize(config: WidgetConfig): Promise<InitializationStatus> {
    return initializeWidget(config);
  },
  destroy(): void { destroyWidget(); },
  getStatus()     { return runtime.status; },
  getVersion()    { return runtime.sdkVersion; },
  getConfig()     { return runtime.config; },
  getDiagnostics(){ return getDiagnostics(); },
  get runtime()   { return runtime; },
  get eventBus()  { return eventBus; },
  registerModule(mod: IWidgetModule): boolean  { return registry.register(mod); },
  unregisterModule(id: string): boolean        { return registry.unregister(id, runtime.config); },
  listModules(): string[]                      { return registry.getAll().map(m => m.id); },

  // ── B.1.4 ─────────────────────────────────────────────────────────────────
  getConfiguration() {
    return runtime.configuration.getResolvedConfig();
  },
  reloadConfiguration() {
    return runtime.configuration.resolve();
  },
  setConfigurationOverrides(overrides: Partial<WidgetConfig>) {
    return runtime.configuration.setRuntimeOverrides(overrides);
  },
  resetConfiguration() {
    return runtime.configuration.reset();
  },

  // ── B.2.1 ─────────────────────────────────────────────────────────────────
  get transport() {
    return runtime.transport;
  },
  setTransportAdapter(adapter: TransportAdapter): void {
    runtime.transport.setAdapter(adapter);
  },
  getTransportAdapter(): string {
    return runtime.transport.getAdapter().name;
  },

  // ── B.2.3 ─────────────────────────────────────────────────────────────────
  get credentials() {
    return runtime.credentials;
  },
  setCredentialsProvider(provider: CredentialsProvider): void {
    runtime.credentials.setProvider(provider);
  },
  isAuthenticated(): boolean {
    return runtime.credentials.isAuthenticated();
  },

  // ── B.2.4 ─────────────────────────────────────────────────────────────────
  get orchestrator() {
    return runtime.orchestrator;
  },

  // ── B.2.5 ─────────────────────────────────────────────────────────────────
  get retryEngine() {
    return runtime.retryEngine;
  },

  // ── B.2.6 ─────────────────────────────────────────────────────────────────
  get resilience() {
    return runtime.resilience;
  },

  // ── B.2.7 ─────────────────────────────────────────────────────────────────
  get connectivity() {
    return runtime.connectivity;
  },

  // ── B.2.8 ─────────────────────────────────────────────────────────────────
  get realtime() {
    return runtime.realtime;
  },

  // ── C.1 ───────────────────────────────────────────────────────────────────
  get renderer() {
    return runtime.renderer;
  },

  // ── C.2 ───────────────────────────────────────────────────────────────────
  get ui() {
    return runtime.ui;
  },

  // ── C.3 ───────────────────────────────────────────────────────────────────
  get launcher() {
    return runtime.launcher;
  },

  // ── C.4 ───────────────────────────────────────────────────────────────────
  get conversation() {
    return runtime.conversation;
  },

  // ── C.5 ───────────────────────────────────────────────────────────────────
  get installation() {
    return runtime.installation;
  },
  async install(embedMode) {
    if (!runtime.installation) {
      // Not yet initialized — run full init first, then delegate
      throw new Error('[LeadFlow] install() called before widget is initialized');
    }
    return runtime.installation.install(embedMode);
  },
  uninstall() {
    runtime.installation?.uninstall() ?? destroyWidget();
  },
  // ── C.6 ───────────────────────────────────────────────────────────────────
  get dashboard() {
    return runtime.dashboard;
  },
  connectDashboard(config) {
    if (!runtime.dashboard) throw new Error('[LeadFlow] dashboard not available — call initialize() first');
    return runtime.dashboard.connect(config);
  },
  disconnectDashboard() {
    runtime.dashboard?.disconnect();
  },
  pushDashboardConfig(config) {
    if (!runtime.dashboard) throw new Error('[LeadFlow] dashboard not available — call initialize() first');
    return runtime.dashboard.push(config);
  },
  pullDashboardState() {
    if (!runtime.dashboard) throw new Error('[LeadFlow] dashboard not available — call initialize() first');
    return runtime.dashboard.pull();
  },
  rollbackDashboardConfig() {
    if (!runtime.dashboard) throw new Error('[LeadFlow] dashboard not available — call initialize() first');
    return runtime.dashboard.rollback();
  },
  // ── C.7 ───────────────────────────────────────────────────────────────────
  get branding() {
    return runtime.branding;
  },
  applyBranding(config) {
    if (!runtime.branding) throw new Error('[LeadFlow] branding not available — call initialize() first');
    runtime.branding.apply(config);
  },
  resetBranding() {
    runtime.branding?.reset();
  },
  getActiveBrand() {
    return runtime.branding?.getActiveBrand() ?? null;
  },

  // ── C.5 (reinstall / reload) ───────────────────────────────────────────
  async reinstall(embedMode) {
    if (!runtime.installation) {
      if (!runtime.config) throw new Error('[LeadFlow] reinstall() called before widget has ever been initialized');
      (runtime as unknown as { installation: ReturnType<typeof createIntegrationManager> }).installation =
        createIntegrationManager(
          { ...runtime.config, embedMode: 'floating' },
          initializeWidget,
          destroyWidget,
          false
        );
    }
    return runtime.installation!.reinstall(embedMode);
  },
  async reload() {
    if (!runtime.installation) {
      if (!runtime.config) throw new Error('[LeadFlow] reload() called before widget has ever been initialized');
      (runtime as unknown as { installation: ReturnType<typeof createIntegrationManager> }).installation =
        createIntegrationManager(
          { ...runtime.config, embedMode: 'floating' },
          initializeWidget,
          destroyWidget,
          false
        );
    }
    return runtime.installation!.reload();
  },
  getInstallationStatus() {
    return runtime.installation?.status() ?? 'not-installed';
  },
};

(window as unknown as Record<string, unknown>)[WINDOW_GLOBAL] = sdk;

// ─── Script tag locator ───────────────────────────────────────────────────────

function findScriptTag(): HTMLScriptElement | null {
  if (document.currentScript instanceof HTMLScriptElement) {
    return document.currentScript;
  }
  const scripts = Array.from(
    document.querySelectorAll<HTMLScriptElement>('script[data-business]')
  );
  return scripts.length > 0 ? scripts[scripts.length - 1] : null;
}

// ─── Auto-initialization IIFE ─────────────────────────────────────────────────

(async function run(): Promise<void> {
  const script = findScriptTag();

  if (!script) {
    console.error(
      `${LOG_PREFIX} Could not locate the LeadFlow script tag. ` +
      `Ensure the <script> tag has a data-business attribute and is loaded ` +
      `synchronously (not via dynamic import).`
    );
    return;
  }

  // B.1.4: Load script attributes into the Configuration Service (Layer 2)
  const scriptLayer = parseScriptAttributes(script);
  runtime.configuration.load(scriptLayer);
  const resolvedConfig = runtime.configuration.resolve();

  // Fallback to legacy parseConfig for error messaging on missing businessId
  if (!resolvedConfig) {
    parseConfig(script);   // triggers the descriptive console.error
    return;
  }

  const status = await initializeWidget(resolvedConfig);

  switch (status) {
    case 'mounted':
      console.log(
        `${LOG_PREFIX} Widget initialized. ` +
        `business=${resolvedConfig.businessId}  ` +
        `position=${resolvedConfig.position}  ` +
        `theme=${resolvedConfig.theme}  ` +
        `v=${runtime.sdkVersion}`
      );
      break;
    case 'already-initialized':
    case 'error':
      break;
  }
})();
