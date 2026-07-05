/**
 * launcher/badge.ts — Badge system.
 * Count badge, dot badge, animated updates, hidden state.
 */

import { eventBus }    from '../eventBus';
import { WidgetEvent } from '../events';
import type { LauncherBadge, BadgeType } from './types';

export class BadgeManager {
  private _element:  HTMLElement | null = null;
  private _type:     BadgeType  = 'hidden';
  private _count     = 0;
  private _visible   = false;

  mount(parent: HTMLElement): void {
    this._element = document.createElement('div');
    this._element.className       = 'lf-badge';
    this._element.setAttribute('aria-hidden', 'true');
    this._element.style.cssText = [
      'position:absolute',
      'top:-4px',
      'right:-4px',
      'min-width:18px',
      'height:18px',
      'border-radius:9999px',
      'background:var(--lf-badge-bg,#ef4444)',
      'color:#fff',
      'font-size:11px',
      'font-weight:700',
      'display:none',
      'align-items:center',
      'justify-content:center',
      'padding:0 4px',
      'line-height:1',
      'pointer-events:none',
    ].join(';');
    parent.appendChild(this._element);
  }

  setCount(count: number): void {
    this._count   = Math.max(0, count);
    this._type    = this._count > 0 ? 'count' : (this._visible ? 'dot' : 'hidden');
    this._render();
    this._emitUpdate();
  }

  show(): void {
    this._visible = true;
    if (this._type === 'hidden') this._type = this._count > 0 ? 'count' : 'dot';
    this._render();
    this._emitUpdate();
  }

  hide(): void {
    this._visible = false;
    this._type    = 'hidden';
    this._render();
    this._emitUpdate();
  }

  clear(): void {
    this._count   = 0;
    this._type    = 'hidden';
    this._visible = false;
    this._render();
    this._emitUpdate();
  }

  getState(): LauncherBadge {
    return { type: this._type, count: this._count, visible: this._visible };
  }

  private _render(): void {
    if (!this._element) return;
    if (this._type === 'hidden' || !this._visible) {
      this._element.style.display = 'none';
      return;
    }
    this._element.style.display = 'flex';
    if (this._type === 'count') {
      this._element.textContent = this._count > 99 ? '99+' : String(this._count);
      this._element.style.minWidth = '18px';
    } else {
      // dot
      this._element.textContent = '';
      this._element.style.minWidth = '10px';
      this._element.style.width    = '10px';
      this._element.style.height   = '10px';
    }
  }

  private _emitUpdate(): void {
    eventBus.emit(WidgetEvent.BADGE_UPDATED, {
      timestamp: new Date().toISOString(),
      type:      this._type,
      count:     this._count,
      visible:   this._visible,
    });
  }

  destroy(): void {
    if (this._element?.parentNode) {
      this._element.parentNode.removeChild(this._element);
    }
    this._element = null;
  }
}
