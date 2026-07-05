/**
 * conversation/controller.ts — Conversation Controller singleton.
 * Owns: shell, state machine. Coordinates with launcher state.
 */

import { ConversationStateMachine } from './state';
import { ConversationShell }        from './shell';
import { eventBus }                 from '../eventBus';
import { WidgetEvent }              from '../events';
import type {
  IConversationController,
  ConversationState,
  ConversationStatus,
  ConversationDiagnostics,
} from './types';
import type { IResponsiveManager } from '../ui/types';

export function createConversationController(
  contentRoot: HTMLElement,
  responsive?: IResponsiveManager,
  title = 'LeadFlow Chat'
): IConversationController {

  const _sm    = new ConversationStateMachine();
  const _shell = new ConversationShell({
    title,
    responsive,
    onMinimize: () => _ctrl.minimize(),
    onClose:    () => _ctrl.close(),
  });

  _shell.mount(contentRoot);
  _shell.setVisible(false);

  const _ctrl: IConversationController = {

    open(): void {
      if (!_sm.canTransition('opening')) return;
      _sm.transition('opening');
      _shell.setVisible(true);
      _sm.transition('open');
      eventBus.emit(WidgetEvent.CONVERSATION_OPENED, {
        timestamp: new Date().toISOString(),
      });
    },

    close(): void {
      if (!_sm.canTransition('closing')) return;
      _sm.transition('closing');
      _shell.setVisible(false);
      _shell.setMinimized(false);
      _sm.transition('closed');
      eventBus.emit(WidgetEvent.CONVERSATION_CLOSED, {
        timestamp: new Date().toISOString(),
      });
    },

    minimize(): void {
      if (!_sm.canTransition('minimized')) return;
      _sm.transition('minimized');
      _shell.setMinimized(true);
      eventBus.emit(WidgetEvent.CONVERSATION_MINIMIZED, {
        timestamp: new Date().toISOString(),
      });
    },

    restore(): void {
      if (!_sm.canTransition('open')) return;
      _sm.transition('open');
      _shell.setMinimized(false);
      eventBus.emit(WidgetEvent.CONVERSATION_RESTORED, {
        timestamp: new Date().toISOString(),
      });
    },

    toggle(): void {
      if (_sm.isOpen() && !_sm.isMinimized()) {
        this.close();
      } else if (_sm.isMinimized()) {
        this.restore();
      } else {
        this.open();
      }
    },

    isOpen():      boolean { return _sm.isOpen(); },
    isMinimized(): boolean { return _sm.isMinimized(); },
    getState():    ConversationState { return _sm.state; },

    getStatus(): ConversationStatus {
      return {
        state:        _sm.state,
        visible:      _sm.isVisible(),
        minimized:    _sm.isMinimized(),
        fullscreen:   false,
        messageCount: _shell.body.messageCount,
        inputLength:  _shell.composer.getLength(),
      };
    },

    appendMessage(html: string): void { _shell.body.append(html); },
    clearMessages():              void { _shell.body.clear(); },
    scrollToBottom():             void { _shell.body.scrollToBottom(); },

    setInputPlaceholder(text: string): void { _shell.composer.setPlaceholder(text); },
    setInputDisabled(disabled: boolean): void { _shell.composer.setDisabled(disabled); },
    getInputValue(): string { return _shell.composer.getValue(); },
    clearInput():    void   { _shell.composer.clear(); },

    getDiagnostics(): ConversationDiagnostics {
      return {
        conversationVisible: _sm.isVisible(),
        conversationState:   _sm.state,
        inputLength:         _shell.composer.getLength(),
        messageCount:        _shell.body.messageCount,
        minimized:           _sm.isMinimized(),
        fullscreen:          false,
      };
    },

    destroy(): void {
      _shell.destroy();
    },
  };

  return _ctrl;
}
