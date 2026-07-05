/**
 * conversation/composer.ts — Input area composer.
 * Owns: input field, send button, character counter.
 */

import { ConversationInput } from './input';
import type { InputOptions } from './types';

export class ConversationComposer {
  private _element:   HTMLElement | null = null;
  private _input:     ConversationInput;
  private _sendBtn:   HTMLButtonElement | null = null;
  private _counter:   HTMLElement | null = null;
  private _maxLength: number;

  constructor(opts: InputOptions = {}, onSend?: (value: string) => void) {
    this._maxLength = opts.maxLength ?? 500;
    this._input     = new ConversationInput(opts, (value) => {
      onSend?.(value);
      this._updateCounter();
    });
  }

  mount(parent: HTMLElement): void {
    this._element = document.createElement('div');
    this._element.className = 'lf-conv-composer';
    this._element.style.cssText = [
      'padding:12px 16px',
      'border-top:1px solid var(--lf-border,#e2e8f0)',
      'display:flex',
      'flex-direction:column',
      'gap:6px',
      'flex-shrink:0',
      'background:var(--lf-bg,#fff)',
    ].join(';');

    // Input row
    const inputRow = document.createElement('div');
    inputRow.style.cssText = 'display:flex;align-items:flex-end;gap:8px;';

    this._input.mount(inputRow);

    // Send button — triggers submit via keyboard event on the textarea
    this._sendBtn = document.createElement('button') as HTMLButtonElement;
    this._sendBtn.type = 'button';
    this._sendBtn.className = 'lf-conv-send';
    this._sendBtn.setAttribute('aria-label', 'Send message');
    this._sendBtn.style.cssText = [
      'width:38px',
      'height:38px',
      'border:none',
      'border-radius:var(--lf-radius,12px)',
      'background:var(--lf-primary,#6366f1)',
      'color:#fff',
      'cursor:pointer',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'flex-shrink:0',
      'transition:background 150ms ease,transform 150ms ease',
    ].join(';');
    this._sendBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22,2 15,22 11,13 2,9"/></svg>';
    this._sendBtn.addEventListener('click', () => {
      if (this._input.getValue().trim()) {
        this._input.submit();
      }
    });

    inputRow.appendChild(this._sendBtn);
    this._element.appendChild(inputRow);

    // Character counter
    this._counter = document.createElement('div');
    this._counter.className = 'lf-conv-counter';
    this._counter.style.cssText = 'font-size:11px;color:var(--lf-text-subtle,#94a3b8);text-align:right;';
    this._counter.textContent = `0 / ${this._maxLength}`;
    this._element.appendChild(this._counter);

    parent.appendChild(this._element);

    // Update counter on input — poll via getLength() after each input event
    // (The input field itself also fires INPUT_CHANGED, but we need local counter sync)
    const inputWrap = inputRow.querySelector('.lf-conv-input-wrap');
    if (inputWrap) {
      inputWrap.addEventListener('input', () => this._updateCounter());
    }
  }

  private _updateCounter(): void {
    if (this._counter) {
      const len = this._input.getLength();
      this._counter.textContent = `${len} / ${this._maxLength}`;
      this._counter.style.color = len > this._maxLength * 0.9
        ? 'var(--lf-error,#ef4444)'
        : 'var(--lf-text-subtle,#94a3b8)';
    }
  }

  getValue():  string { return this._input.getValue(); }
  getLength(): number { return this._input.getLength(); }
  clear():     void   { this._input.clear(); this._updateCounter(); }
  focus():     void   { this._input.focus(); }

  setDisabled(disabled: boolean): void {
    this._input.setDisabled(disabled);
    if (this._sendBtn) this._sendBtn.disabled = disabled;
  }

  setPlaceholder(text: string): void {
    this._input.setPlaceholder(text);
  }

  destroy(): void {
    this._input.destroy();
    if (this._element?.parentNode) this._element.parentNode.removeChild(this._element);
    this._element = null;
  }
}
