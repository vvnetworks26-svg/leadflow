/**
 * launcher/button.ts — Launcher button component.
 * Extends BaseComponent. Mounts into the renderer's content root.
 * Full keyboard accessibility: Tab, Space, Enter.
 * Reduced-motion compatible via CSS media query.
 */

import { BaseComponent }  from '../ui/component';
import { BadgeManager }   from './badge';
import { PositionManager } from './position';
import { renderIcon, DEFAULT_ICON, CLOSE_ICON } from './icon';
import type { LauncherPosition } from './types';

const BUTTON_SIZE = '56px';

const BUTTON_CSS = `
.lf-launcher-btn {
  position: relative;
  width:  ${BUTTON_SIZE};
  height: ${BUTTON_SIZE};
  border-radius: var(--lf-radius, 12px);
  border:  none;
  cursor:  pointer;
  background: var(--lf-primary, #6366f1);
  color:  #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--lf-shadow, 0 4px 24px rgba(0,0,0,0.12));
  transition: transform 200ms ease, box-shadow 200ms ease, background 200ms ease;
  outline: none;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}
.lf-launcher-btn:hover:not(:disabled) {
  transform: scale(1.06);
  box-shadow: 0 8px 32px rgba(0,0,0,0.18);
  background: var(--lf-primary-hover, #4f46e5);
}
.lf-launcher-btn:active:not(:disabled) {
  transform: scale(0.94);
}
.lf-launcher-btn:focus-visible {
  outline: 3px solid var(--lf-primary, #6366f1);
  outline-offset: 3px;
}
.lf-launcher-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.lf-launcher-icon {
  width:  26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.lf-launcher-icon svg {
  width: 100%;
  height: 100%;
}
@media (prefers-reduced-motion: reduce) {
  .lf-launcher-btn { transition: none; }
}
`.trim();

export class LauncherButton extends BaseComponent {
  private _badge:    BadgeManager;
  private _position: PositionManager;
  private _wrapper:  HTMLElement | null = null;
  private _btn:      HTMLButtonElement | null = null;
  private _iconEl:   HTMLElement | null = null;
  private _styleEl:  HTMLStyleElement | null = null;
  private _onClick?: () => void;

  constructor(position: LauncherPosition = 'bottom-right', onClick?: () => void) {
    super('lf-launcher');
    this._badge    = new BadgeManager();
    this._position = new PositionManager(position);
    this._onClick  = onClick;
  }

  render(): void {
    if (!this._element) return;

    // Inject button CSS into the shadow root
    const shadowRoot = this._element.getRootNode() as ShadowRoot | null;
    if (shadowRoot && 'insertBefore' in shadowRoot) {
      this._styleEl = document.createElement('style');
      this._styleEl.setAttribute('data-lf-styles', 'launcher');
      this._styleEl.textContent = BUTTON_CSS;
      shadowRoot.appendChild(this._styleEl);
    }

    // Wrapper — positioned by PositionManager
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'lf-launcher-wrapper';
    this._wrapper.style.cssText = 'position:fixed;z-index:var(--lf-z-launcher,2147483640);pointer-events:auto;';

    // Button
    this._btn = document.createElement('button') as HTMLButtonElement;
    this._btn.className      = 'lf-launcher-btn';
    this._btn.type           = 'button';
    this._btn.setAttribute('aria-label', 'Open chat');
    this._btn.setAttribute('aria-expanded', 'false');
    this._btn.setAttribute('aria-haspopup', 'dialog');

    // Icon container
    this._iconEl = document.createElement('div');
    this._iconEl.className = 'lf-launcher-icon';
    renderIcon(this._iconEl, DEFAULT_ICON);

    this._btn.appendChild(this._iconEl);
    this._wrapper.appendChild(this._btn);
    this._element.appendChild(this._wrapper);

    // Badge
    this._badge.mount(this._btn);

    // Position
    this._position.attach(this._wrapper);

    // Events
    this._btn.addEventListener('click', () => this._onClick?.());
    this._btn.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        this._onClick?.();
      }
    });
  }

  setOpen(isOpen: boolean): void {
    if (!this._btn || !this._iconEl) return;
    this._btn.setAttribute('aria-expanded', String(isOpen));
    this._btn.setAttribute('aria-label', isOpen ? 'Close chat' : 'Open chat');
    renderIcon(this._iconEl, isOpen ? CLOSE_ICON : DEFAULT_ICON);
  }

  setEnabled(enabled: boolean): void {
    if (this._btn) {
      if (enabled) this._btn.removeAttribute('disabled');
      else         this._btn.setAttribute('disabled', 'true');
    }
  }

  setVisible(visible: boolean): void {
    if (this._wrapper) {
      this._wrapper.style.display = visible ? '' : 'none';
    }
  }

  setPosition(position: LauncherPosition): void {
    this._position.setPosition(position);
  }

  getPosition(): LauncherPosition {
    return this._position.getPosition();
  }

  getBadge(): BadgeManager { return this._badge; }

  override destroy(): void {
    this._badge.destroy();
    if (this._styleEl?.parentNode) this._styleEl.parentNode.removeChild(this._styleEl);
    super.destroy();
  }
}
