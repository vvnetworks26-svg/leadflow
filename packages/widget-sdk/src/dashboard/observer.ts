/**
 * dashboard/observer.ts — Runtime state observer.
 *
 * Observes the runtime for changes to:
 *   - Theme
 *   - Launcher state
 *   - Conversation state
 *   - Installation status
 *   - Viewport
 *   - Configuration version
 *
 * Emits a snapshot only when values actually change.
 * No polling — event-driven via the event bus.
 */

import { eventBus }                  from '../eventBus';
import { WidgetEvent }               from '../events';
import type { WidgetRuntime }        from '../types';
import type { IObserver, ObservedState } from './types';

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createObserver(runtime: WidgetRuntime): IObserver {
  const _listeners: Array<(state: ObservedState) => void> = [];

  function _snapshot(): ObservedState {
    const ui      = runtime.ui?.getDiagnostics();
    const launcher = runtime.launcher?.getDiagnostics();
    const conv    = runtime.conversation?.getDiagnostics();
    const install = runtime.installation?.getDiagnostics();
    const cfg     = runtime.configuration;

    return {
      theme:              ui?.activeTheme              ?? 'light',
      launcherOpen:       launcher?.launcherOpen       ?? false,
      launcherVisible:    launcher?.launcherVisible    ?? false,
      conversationState:  conv?.conversationState      ?? 'closed',
      installationStatus: install?.installationStatus  ?? 'not-installed',
      viewport:           ui?.viewport                 ?? '',
      configVersion:      cfg.getVersion(),
      resolvedConfig:     cfg.getResolvedConfig(),
    };
  }

  let _last: ObservedState = _snapshot();

  function _notify(): void {
    const current = _snapshot();

    // Only notify if something actually changed
    const changed =
      current.theme              !== _last.theme              ||
      current.launcherOpen       !== _last.launcherOpen       ||
      current.launcherVisible    !== _last.launcherVisible    ||
      current.conversationState  !== _last.conversationState  ||
      current.installationStatus !== _last.installationStatus ||
      current.viewport           !== _last.viewport           ||
      current.configVersion      !== _last.configVersion;

    if (!changed) return;
    _last = current;
    for (const fn of _listeners) {
      try { fn(current); } catch { /* silent */ }
    }
  }

  // Subscribe to events that signal state changes
  const events = [
    WidgetEvent.THEME_CHANGED,
    WidgetEvent.LAUNCHER_OPENED,
    WidgetEvent.LAUNCHER_CLOSED,
    WidgetEvent.LAUNCHER_SHOWN,
    WidgetEvent.LAUNCHER_HIDDEN,
    WidgetEvent.CONVERSATION_OPENED,
    WidgetEvent.CONVERSATION_CLOSED,
    WidgetEvent.CONVERSATION_MINIMIZED,
    WidgetEvent.CONVERSATION_RESTORED,
    WidgetEvent.RESPONSIVE_CHANGED,
    WidgetEvent.CONFIG_RESOLVED,
    WidgetEvent.CONFIG_UPDATED,
    WidgetEvent.CONFIG_SYNC_COMPLETED,
    WidgetEvent.INSTALL_COMPLETED,
    WidgetEvent.UNINSTALL_COMPLETED,
    WidgetEvent.REINSTALL_COMPLETED,
  ] as const;

  // Store listeners for cleanup via off()
  const _handlers: Array<() => void> = [];

  for (const ev of events) {
    const handler = () => _notify();
    _handlers.push(handler);
    eventBus.on(ev, handler);
  }

  return {
    snapshot(): ObservedState {
      return _snapshot();
    },

    onChange(listener: (state: ObservedState) => void): () => void {
      _listeners.push(listener);
      return () => {
        const i = _listeners.indexOf(listener);
        if (i !== -1) _listeners.splice(i, 1);
      };
    },

    destroy(): void {
      // Unsubscribe each handler from its event
      events.forEach((ev, i) => {
        try { eventBus.off(ev, _handlers[i]!); } catch { /* silent */ }
      });
      _handlers.length  = 0;
      _listeners.length = 0;
    },
  };
}
