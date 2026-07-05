/**
 * conversation/state.ts — Conversation Shell state machine.
 */

import type { ConversationState } from './types';

const TRANSITIONS: Readonly<Record<ConversationState, ReadonlyArray<ConversationState>>> = {
  closed:    ['opening', 'disabled'],
  opening:   ['open', 'closing', 'closed'],
  open:      ['closing', 'minimized', 'disabled'],
  closing:   ['closed', 'opening'],
  minimized: ['open', 'closing', 'disabled'],
  disabled:  ['closed'],
};

export class ConversationStateMachine {
  private _state: ConversationState = 'closed';

  get state(): ConversationState { return this._state; }

  canTransition(to: ConversationState): boolean {
    return TRANSITIONS[this._state].includes(to);
  }

  transition(to: ConversationState): boolean {
    if (!this.canTransition(to)) return false;
    this._state = to;
    return true;
  }

  isOpen():      boolean { return this._state === 'open' || this._state === 'opening'; }
  isVisible():   boolean { return this._state !== 'closed' && this._state !== 'disabled'; }
  isMinimized(): boolean { return this._state === 'minimized'; }
  isEnabled():   boolean { return this._state !== 'disabled'; }
}
