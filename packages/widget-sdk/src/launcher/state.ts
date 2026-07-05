/**
 * launcher/state.ts — Launcher state machine.
 * Controls all valid state transitions. No invalid moves.
 */

import type { LauncherState } from './types';

const TRANSITIONS: Readonly<Record<LauncherState, ReadonlyArray<LauncherState>>> = {
  closed:   ['opening', 'hidden', 'disabled'],
  opening:  ['open', 'closing', 'closed'],
  open:     ['closing', 'hidden', 'disabled'],
  closing:  ['closed', 'opening'],
  hidden:   ['closed', 'disabled'],
  disabled: ['closed', 'hidden'],
};

export class LauncherStateMachine {
  private _state:       LauncherState = 'closed';
  private _toggleCount  = 0;
  private _openedAt:    string | null = null;

  get state(): LauncherState { return this._state; }
  get toggleCount(): number  { return this._toggleCount; }
  get openedAt(): string | null { return this._openedAt; }

  canTransition(to: LauncherState): boolean {
    return TRANSITIONS[this._state].includes(to);
  }

  transition(to: LauncherState): boolean {
    if (!this.canTransition(to)) return false;
    const prev = this._state;
    this._state = to;
    if (to === 'open')   { this._toggleCount++; this._openedAt = new Date().toISOString(); }
    if (to === 'closed' && (prev === 'open' || prev === 'closing')) this._toggleCount++;
    return true;
  }

  isOpen():    boolean { return this._state === 'open' || this._state === 'opening'; }
  isVisible(): boolean { return this._state !== 'hidden'; }
  isEnabled(): boolean { return this._state !== 'disabled'; }
}
