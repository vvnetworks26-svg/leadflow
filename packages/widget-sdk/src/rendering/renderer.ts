/**
 * rendering/renderer.ts
 *
 * Widget Renderer singleton.
 *
 * Responsibilities:
 *   render(widgetRoot) — build Shadow DOM hierarchy, inject styles
 *   update(changes)    — apply theme/position/colour changes without full re-render
 *   destroy()          — tear down all rendering resources
 *   isMounted()        — check current state
 *   getContainer()     — access the WidgetContainer
 *   getRoot()          — access the content mounting point
 *   getStatus()        — full RendererStatus snapshot
 *
 * No React. No Svelte. No Vue. Pure DOM APIs only.
 * Future components will mount into getRoot().
 */

import { mount, unmount }        from './mount';
import { updateContainer }       from './container';
import { eventBus }              from '../eventBus';
import { WidgetEvent }           from '../events';
import { LOG_PREFIX }            from '../constants';
import type {
  IRenderer,
  WidgetContainer,
  RendererState,
  RendererStatus,
  RenderUpdate,
  RenderDiagnostics,
  StyleManager,
} from './types';

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createRenderer(): IRenderer & { getDiagnostics(): RenderDiagnostics } {
  let _state:        RendererState       = 'idle';
  let _container:    WidgetContainer | null = null;
  let _styleManager: StyleManager | null   = null;
  let _renderCount   = 0;
  let _mountedAt:    string | null         = null;

  return {
    render(widgetRoot: HTMLDivElement): void {
      if (_state === 'mounted' || _state === 'mounting') {
        console.warn(`${LOG_PREFIX} Renderer already mounted — call destroy() first.`);
        return;
      }

      _state = 'mounting';
      _renderCount++;

      const config = widgetRoot.dataset;
      const position     = config['lfPosition']     ?? 'bottom-right';
      const primaryColor = config['lfPrimaryColor'] ?? '#6366f1';

      try {
        const result = mount(widgetRoot, position, primaryColor);
        _container    = result.container;
        _styleManager = result.styleManager;
        _state        = 'mounted';
        _mountedAt    = new Date().toISOString();
      } catch (err) {
        _state = 'idle';
        console.error(`${LOG_PREFIX} Renderer.render() failed:`, err);
        throw err;
      }
    },

    update(changes: Partial<RenderUpdate>): void {
      if (_state !== 'mounted' || !_container) {
        console.warn(`${LOG_PREFIX} Renderer.update() called while not mounted.`);
        return;
      }

      _state = 'updating';
      _renderCount++;

      updateContainer(_container, changes.position, changes.primaryColor);

      _state = 'mounted';

      eventBus.emit(WidgetEvent.RENDERER_UPDATED, {
        timestamp: new Date().toISOString(),
        changes:   Object.keys(changes),
      });
    },

    destroy(): void {
      if (_state === 'idle' || _state === 'unmounted') return;

      _state = 'unmounting';

      if (_container && _styleManager) {
        unmount(_container, _styleManager);
      }

      _container    = null;
      _styleManager = null;
      _mountedAt    = null;
      _state        = 'unmounted';
    },

    isMounted(): boolean {
      return _state === 'mounted';
    },

    getContainer(): WidgetContainer | null {
      return _container;
    },

    getRoot(): HTMLDivElement | null {
      return _container?.contentRoot ?? null;
    },

    getStatus(): RendererStatus {
      return {
        state:       _state,
        mountedAt:   _mountedAt,
        renderCount: _renderCount,
      };
    },

    getDiagnostics(): RenderDiagnostics {
      return {
        mounted:        _state === 'mounted',
        shadowDOM:      _container?.shadowRoot != null,
        containerReady: _container?.container != null,
        stylesInjected: _styleManager?.isInjected() ?? false,
        renderCount:    _renderCount,
      };
    },
  };
}
