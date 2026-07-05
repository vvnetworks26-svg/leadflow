/**
 * launcher/controller.ts — Launcher Controller singleton.
 * Owns: button, badge, icon, position, state machine.
 * Public API: open/close/toggle/show/hide/enable/disable.
 */

import { LauncherStateMachine } from './state';
import { LauncherButton }       from './button';
import { eventBus }             from '../eventBus';
import { WidgetEvent }          from '../events';
import type {
  ILauncherController,
  LauncherState,
  LauncherStatus,
  LauncherDiagnostics,
  LauncherPosition,
} from './types';

export function createLauncherController(
  contentRoot: HTMLElement,
  position:    LauncherPosition = 'bottom-right'
): ILauncherController {

  const _sm     = new LauncherStateMachine();
  const _button = new LauncherButton(position, () => _controller.toggle());

  // Mount button into the renderer content root
  _button.mount(contentRoot);

  // ─── Helpers ─────────────────────────────────────────────────────────────

  function _syncButton(): void {
    _button.setOpen(_sm.isOpen());
    _button.setVisible(_sm.isVisible());
    _button.setEnabled(_sm.isEnabled());
  }

  // ─── Controller ──────────────────────────────────────────────────────────

  const _controller: ILauncherController = {

    open(): void {
      if (!_sm.canTransition('opening')) return;
      _sm.transition('opening');
      _syncButton();
      // Immediate → open (no async animation yet)
      _sm.transition('open');
      _syncButton();
      eventBus.emit(WidgetEvent.LAUNCHER_OPENED, {
        timestamp: new Date().toISOString(),
        position:  _button.getPosition(),
      });
    },

    close(): void {
      if (!_sm.canTransition('closing')) return;
      _sm.transition('closing');
      _syncButton();
      _sm.transition('closed');
      _syncButton();
      eventBus.emit(WidgetEvent.LAUNCHER_CLOSED, {
        timestamp: new Date().toISOString(),
        position:  _button.getPosition(),
      });
    },

    toggle(): void {
      if (_sm.isOpen()) {
        this.close();
      } else if (_sm.state === 'closed') {
        this.open();
      }
      eventBus.emit(WidgetEvent.LAUNCHER_TOGGLED, {
        timestamp: new Date().toISOString(),
        isOpen:    _sm.isOpen(),
      });
    },

    show(): void {
      if (!_sm.canTransition('closed')) return;
      _sm.transition('closed');
      _syncButton();
      eventBus.emit(WidgetEvent.LAUNCHER_SHOWN, {
        timestamp: new Date().toISOString(),
      });
    },

    hide(): void {
      if (!_sm.canTransition('hidden')) return;
      _sm.transition('hidden');
      _syncButton();
      eventBus.emit(WidgetEvent.LAUNCHER_HIDDEN, {
        timestamp: new Date().toISOString(),
      });
    },

    enable(): void {
      if (!_sm.canTransition('closed')) return;
      _sm.transition('closed');
      _syncButton();
    },

    disable(): void {
      if (!_sm.canTransition('disabled')) return;
      _sm.transition('disabled');
      _syncButton();
    },

    isOpen(): boolean { return _sm.isOpen(); },

    getState(): LauncherState { return _sm.state; },

    getStatus(): LauncherStatus {
      return {
        state:       _sm.state,
        visible:     _sm.isVisible(),
        enabled:     _sm.isEnabled(),
        toggleCount: _sm.toggleCount,
        openedAt:    _sm.openedAt,
      };
    },

    setBadgeCount(count: number): void {
      _button.getBadge().setCount(count);
      _button.getBadge().show();
    },

    showBadge(): void   { _button.getBadge().show(); },
    hideBadge(): void   { _button.getBadge().hide(); },
    clearBadge(): void  { _button.getBadge().clear(); },

    setPosition(position: LauncherPosition): void {
      _button.setPosition(position);
    },

    getDiagnostics(): LauncherDiagnostics {
      return {
        launcherVisible:  _sm.isVisible(),
        launcherEnabled:  _sm.isEnabled(),
        launcherOpen:     _sm.isOpen(),
        launcherPosition: _button.getPosition(),
        badgeCount:       _button.getBadge().getState().count,
        toggleCount:      _sm.toggleCount,
      };
    },

    destroy(): void {
      _button.destroy();
    },
  };

  return _controller;
}
