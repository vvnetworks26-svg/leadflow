/**
 * rendering/styles.ts
 *
 * StyleManager — injects base CSS into the widget's ShadowRoot.
 *
 * What is included:
 *   - CSS reset scoped to the widget container
 *   - box-sizing: border-box for all children
 *   - Font inheritance from the host page
 *   - CSS custom properties (design tokens) for theming
 *
 * What is NOT included:
 *   - Component styles (chat, launcher, buttons)
 *   - Animation or transition classes
 *   - Any styles that depend on data from the server
 *
 * The styles use :host and .lf-* class prefixes to avoid conflicts
 * with host-page CSS. Shadow DOM provides natural encapsulation.
 */

import { eventBus }    from '../eventBus';
import { WidgetEvent } from '../events';
import type { StyleManager } from './types';

// ─── Base CSS ─────────────────────────────────────────────────────────────────

/**
 * The base stylesheet injected into every widget ShadowRoot.
 * Uses CSS custom properties as design tokens — all component styles
 * reference these variables rather than hardcoding values.
 */
const BASE_CSS = `
/* ─── Reset ────────────────────────────────────────────── */
:host {
  all: initial;
  display: block;
  position: fixed;
  z-index: 2147483647; /* max z-index — always on top */
  pointer-events: none; /* host itself is click-through */
}

*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

/* ─── Font inheritance ──────────────────────────────────── */
.lf-container {
  font-family: inherit;
  font-size:   inherit;
  line-height: inherit;
  color:       inherit;
  pointer-events: auto;
}

/* ─── CSS custom properties (design tokens) ─────────────── */
.lf-container {
  --lf-primary:       #6366f1;
  --lf-primary-hover: #4f46e5;
  --lf-bg:            #ffffff;
  --lf-bg-secondary:  #f8fafc;
  --lf-border:        #e2e8f0;
  --lf-text:          #0f172a;
  --lf-text-muted:    #64748b;
  --lf-radius:        12px;
  --lf-shadow:        0 4px 24px rgba(0, 0, 0, 0.12);
  --lf-transition:    200ms ease;
  --lf-font-size:     14px;
}

/* ─── Content root ──────────────────────────────────────── */
.lf-content {
  position: relative;
  width:    100%;
  height:   100%;
}
`.trim();

// ─── Implementation ───────────────────────────────────────────────────────────

export function createStyleManager(): StyleManager {
  let _styleEl: HTMLStyleElement | null = null;
  let _injected = false;

  return {
    inject(shadowRoot: ShadowRoot): void {
      if (_injected) return;

      _styleEl = document.createElement('style');
      _styleEl.setAttribute('data-lf-styles', 'base');
      _styleEl.textContent = BASE_CSS;
      shadowRoot.insertBefore(_styleEl, shadowRoot.firstChild);
      _injected = true;

      eventBus.emit(WidgetEvent.STYLES_INJECTED, {
        timestamp: new Date().toISOString(),
        styleType: 'base',
      });
    },

    remove(): void {
      if (_styleEl && _styleEl.parentNode) {
        _styleEl.parentNode.removeChild(_styleEl);
        _styleEl = null;
      }
      _injected = false;
    },

    isInjected(): boolean {
      return _injected;
    },
  };
}
