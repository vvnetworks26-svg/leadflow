/**
 * conversation/footer.ts — Conversation shell footer.
 * Contains: Powered by LeadFlow, status text, future privacy/terms links.
 */

export class ConversationFooter {
  private _element: HTMLElement | null = null;

  mount(parent: HTMLElement): void {
    this._element = document.createElement('div');
    this._element.className = 'lf-conv-footer';
    this._element.style.cssText = [
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'padding:6px 16px',
      'border-top:1px solid var(--lf-border,#e2e8f0)',
      'flex-shrink:0',
    ].join(';');

    const text = document.createElement('span');
    text.className = 'lf-conv-powered';
    text.style.cssText = 'font-size:11px;color:var(--lf-text-subtle,#94a3b8);';
    text.innerHTML = 'Powered by <strong style="color:var(--lf-primary,#6366f1)">LeadFlow</strong>';

    this._element.appendChild(text);
    parent.appendChild(this._element);
  }

  setStatus(text: string): void {
    const el = this._element?.querySelector('.lf-conv-powered') as HTMLElement | null;
    if (el) el.textContent = text;
  }

  destroy(): void {
    if (this._element?.parentNode) this._element.parentNode.removeChild(this._element);
    this._element = null;
  }
}
