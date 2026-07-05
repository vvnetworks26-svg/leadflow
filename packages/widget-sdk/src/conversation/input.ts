/**
 * conversation/input.ts — Chat input field.
 * Supports: multiline, auto-resize, Enter to submit, Shift+Enter newline,
 * disabled state, max length, full accessibility.
 */

import { eventBus }    from '../eventBus';
import { WidgetEvent } from '../events';
import type { InputOptions } from './types';

export class ConversationInput {
  private _textarea:  HTMLTextAreaElement | null = null;
  private _element:   HTMLElement | null = null;
  private _opts:      Required<InputOptions>;
  private _onSubmit?: (value: string) => void;

  constructor(opts: InputOptions = {}, onSubmit?: (value: string) => void) {
    this._opts = {
      placeholder: opts.placeholder ?? 'Type a message…',
      maxLength:   opts.maxLength   ?? 500,
      multiline:   opts.multiline   ?? true,
      disabled:    opts.disabled    ?? false,
    };
    this._onSubmit = onSubmit;
  }

  mount(parent: HTMLElement): void {
    this._element = document.createElement('div');
    this._element.className = 'lf-conv-input-wrap';
    this._element.style.cssText = 'position:relative;display:flex;align-items:flex-end;gap:8px;';

    this._textarea = document.createElement('textarea') as HTMLTextAreaElement;
    this._textarea.className        = 'lf-conv-input';
    this._textarea.placeholder      = this._opts.placeholder;
    this._textarea.maxLength        = this._opts.maxLength;
    this._textarea.disabled         = this._opts.disabled;
    this._textarea.setAttribute('aria-label', 'Message input');
    this._textarea.setAttribute('aria-multiline', 'true');
    this._textarea.rows = 1;
    this._textarea.style.cssText = [
      'flex:1',
      'resize:none',
      'border:1px solid var(--lf-border,#e2e8f0)',
      'border-radius:var(--lf-radius,12px)',
      'padding:10px 14px',
      'font-size:14px',
      'font-family:inherit',
      'line-height:1.5',
      'max-height:120px',
      'overflow-y:auto',
      'outline:none',
      'background:var(--lf-bg-secondary,#f8fafc)',
      'color:var(--lf-text,#0f172a)',
      'transition:border-color 150ms ease',
    ].join(';');

    // Auto-resize
    this._textarea.addEventListener('input', () => {
      this._autoResize();
      eventBus.emit(WidgetEvent.INPUT_CHANGED, {
        timestamp: new Date().toISOString(),
        length:    this._textarea?.value.length ?? 0,
      });
    });

    // Enter to submit, Shift+Enter for newline
    this._textarea.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._submit();
      }
    });

    this._element.appendChild(this._textarea);
    parent.appendChild(this._element);
  }

  private _autoResize(): void {
    if (!this._textarea) return;
    this._textarea.style.height = 'auto';
    this._textarea.style.height = `${Math.min(this._textarea.scrollHeight, 120)}px`;
  }

  private _submit(): void {
    const value = this._textarea?.value.trim() ?? '';
    if (!value || this._opts.disabled) return;
    eventBus.emit(WidgetEvent.SEND_REQUESTED, {
      timestamp: new Date().toISOString(),
      length:    value.length,
    });
    this._onSubmit?.(value);
    this.clear();
  }

  getValue():  string { return this._textarea?.value ?? ''; }
  getLength(): number { return this._textarea?.value.length ?? 0; }

  clear(): void {
    if (this._textarea) {
      this._textarea.value = '';
      this._autoResize();
    }
  }

  setPlaceholder(text: string): void {
    if (this._textarea) this._textarea.placeholder = text;
  }

  setDisabled(disabled: boolean): void {
    this._opts.disabled = disabled;
    if (this._textarea) this._textarea.disabled = disabled;
  }

  focus(): void { this._textarea?.focus(); }

  /** Programmatically submit the current value. */
  submit(): void { this._submit(); }

  destroy(): void {
    if (this._element?.parentNode) this._element.parentNode.removeChild(this._element);
    this._element  = null;
    this._textarea = null;
  }
}
