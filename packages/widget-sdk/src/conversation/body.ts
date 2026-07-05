/**
 * conversation/body.ts — Scrollable message viewport.
 * Initially empty. Future: messages, cards, forms, calendars, media.
 */

export class ConversationBody {
  private _element:    HTMLElement | null = null;
  private _msgCount    = 0;

  mount(parent: HTMLElement): void {
    this._element = document.createElement('div');
    this._element.className = 'lf-conv-body';
    this._element.setAttribute('role', 'log');
    this._element.setAttribute('aria-live', 'polite');
    this._element.setAttribute('aria-label', 'Conversation messages');
    this._element.style.cssText = [
      'flex:1',
      'overflow-y:auto',
      'overflow-x:hidden',
      'padding:16px',
      'display:flex',
      'flex-direction:column',
      'gap:12px',
      'scroll-behavior:smooth',
      'overscroll-behavior:contain',
    ].join(';');
    parent.appendChild(this._element);
  }

  append(html: string): void {
    if (!this._element) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'lf-conv-message';
    wrapper.innerHTML = html;
    this._element.appendChild(wrapper);
    this._msgCount++;
    this.scrollToBottom();
  }

  clear(): void {
    if (!this._element) return;
    this._element.innerHTML = '';
    this._msgCount = 0;
  }

  scrollToBottom(): void {
    if (!this._element) return;
    this._element.scrollTop = this._element.scrollHeight;
  }

  get messageCount(): number { return this._msgCount; }

  destroy(): void {
    if (this._element?.parentNode) this._element.parentNode.removeChild(this._element);
    this._element = null;
  }
}
