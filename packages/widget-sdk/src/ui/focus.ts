/**
 * ui/focus.ts — Focus Manager.
 * Focus trap, restore, keyboard navigation, tab cycling. Accessibility first.
 */

import { eventBus }    from '../eventBus';
import { WidgetEvent } from '../events';
import type { IFocusManager, FocusTrapOptions } from './types';

const FOCUSABLE_SELECTORS = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'textarea:not([disabled])', 'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])', '[contenteditable="true"]',
].join(', ');

export function createFocusManager(): IFocusManager {
  let _previousFocus: HTMLElement | null = null;
  let _trapCleanup:   (() => void) | null = null;

  return {
    getFocusable(container: HTMLElement): HTMLElement[] {
      return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS))
        .filter(el => !el.closest('[hidden]') && getComputedStyle(el).display !== 'none');
    },

    trap(container: HTMLElement, options: FocusTrapOptions = {}): () => void {
      // Release any existing trap
      _trapCleanup?.();

      _previousFocus = options.restoreTo
        ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);

      const focusable = this.getFocusable(container);
      const first     = options.initialFocus ?? focusable[0];

      first?.focus();

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key !== 'Tab') return;
        const focusableNow = this.getFocusable(container);
        const firstNow = focusableNow[0];
        const lastNow  = focusableNow[focusableNow.length - 1];
        if (!firstNow) return;

        if (e.shiftKey) {
          if (document.activeElement === firstNow) {
            e.preventDefault();
            lastNow?.focus();
          }
        } else {
          if (document.activeElement === lastNow) {
            e.preventDefault();
            firstNow.focus();
          }
        }

        eventBus.emit(WidgetEvent.FOCUS_CHANGED, {
          timestamp: new Date().toISOString(),
          trapped:   true,
        });
      };

      container.addEventListener('keydown', onKeyDown);

      _trapCleanup = () => {
        container.removeEventListener('keydown', onKeyDown);
        _trapCleanup = null;
      };

      return () => {
        _trapCleanup?.();
        this.restore();
      };
    },

    restore(): void {
      if (_previousFocus && document.body.contains(_previousFocus)) {
        _previousFocus.focus();
      }
      _previousFocus = null;
    },

    moveFocus(direction: 'next' | 'prev', container: HTMLElement): void {
      const focusable = this.getFocusable(container);
      if (focusable.length === 0) return;
      const current = document.activeElement;
      const idx     = focusable.indexOf(current as HTMLElement);
      let next: HTMLElement;
      if (direction === 'next') {
        next = focusable[(idx + 1) % focusable.length];
      } else {
        next = focusable[(idx - 1 + focusable.length) % focusable.length];
      }
      next.focus();

      eventBus.emit(WidgetEvent.FOCUS_CHANGED, {
        timestamp: new Date().toISOString(),
        trapped:   false,
      });
    },
  };
}
