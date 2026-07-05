/**
 * ui/component.ts — Component base class.
 * Every UI component extends this. No concrete components here.
 */

import type { IComponent, ComponentState, ComponentStatus } from './types';

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

/**
 * Abstract base for all LeadFlow UI components.
 * Subclasses implement render() and optionally override mount/update/destroy.
 */
export abstract class BaseComponent implements IComponent {
  readonly id: string;
  protected _state:     ComponentState = 'idle';
  protected _mountedAt: string | null  = null;
  protected _element:   HTMLElement | null = null;

  constructor(id?: string) {
    this.id = id ?? `lf-${uuid()}`;
  }

  mount(target: HTMLElement): void {
    if (this._state === 'mounted') return;
    this._element  = target;
    this._state    = 'mounted';
    this._mountedAt = new Date().toISOString();
    this.render();
  }

  /** Subclasses implement this to populate this._element. */
  abstract render(): void;

  update(props: Record<string, unknown>): void {
    if (this._state !== 'mounted') return;
    this._state = 'updating';
    this._applyUpdate(props);
    this._state = 'mounted';
  }

  /** Subclasses override to apply prop changes. */
  protected _applyUpdate(_props: Record<string, unknown>): void { /* no-op base */ }

  destroy(): void {
    if (this._state === 'destroyed') return;
    this._state   = 'destroyed';
    this._element = null;
  }

  show(): void {
    if (this._element) this._element.style.display = '';
    if (this._state === 'hidden') this._state = 'mounted';
  }

  hide(): void {
    if (this._element) this._element.style.display = 'none';
    if (this._state === 'mounted') this._state = 'hidden';
  }

  getStatus(): ComponentStatus {
    return { state: this._state, mountedAt: this._mountedAt };
  }

  isMounted(): boolean {
    return this._state === 'mounted' || this._state === 'updating';
  }
}
