/**
 * conversation/header.ts — Conversation Shell header.
 * Contains: company avatar placeholder, name, online indicator, window controls.
 */

export interface HeaderOptions {
  title:       string;
  subtitle?:   string;
  onMinimize?: () => void;
  onClose?:    () => void;
}

export class ConversationHeader {
  private _element: HTMLElement | null = null;
  private _opts: HeaderOptions;

  constructor(opts: HeaderOptions) {
    this._opts = opts;
  }

  mount(parent: HTMLElement): void {
    this._element = document.createElement('div');
    this._element.className = 'lf-conv-header';
    this._element.setAttribute('role', 'banner');
    this._element.style.cssText = [
      'display:flex',
      'align-items:center',
      'padding:14px 16px',
      'border-bottom:1px solid var(--lf-border,#e2e8f0)',
      'background:var(--lf-primary,#6366f1)',
      'border-radius:var(--lf-radius,12px) var(--lf-radius,12px) 0 0',
      'flex-shrink:0',
    ].join(';');

    // Avatar placeholder
    const avatar = document.createElement('div');
    avatar.className = 'lf-conv-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.style.cssText = 'width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.25);display:flex;align-items:center;justify-content:center;flex-shrink:0;';
    avatar.textContent = '💬';

    // Title area
    const titleArea = document.createElement('div');
    titleArea.style.cssText = 'flex:1;margin:0 10px;min-width:0;';

    const titleEl = document.createElement('div');
    titleEl.className = 'lf-conv-title';
    titleEl.textContent = this._opts.title;
    titleEl.style.cssText = 'color:#fff;font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';

    const subtitleEl = document.createElement('div');
    subtitleEl.className = 'lf-conv-subtitle';
    subtitleEl.style.cssText = 'display:flex;align-items:center;gap:4px;';

    // Online indicator dot
    const dot = document.createElement('span');
    dot.style.cssText = 'width:7px;height:7px;border-radius:50%;background:#34d399;display:inline-block;flex-shrink:0;';
    const statusText = document.createElement('span');
    statusText.textContent = this._opts.subtitle ?? 'Online';
    statusText.style.cssText = 'color:rgba(255,255,255,0.75);font-size:12px;';
    subtitleEl.appendChild(dot);
    subtitleEl.appendChild(statusText);

    titleArea.appendChild(titleEl);
    titleArea.appendChild(subtitleEl);

    // Window controls
    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;align-items:center;gap:6px;flex-shrink:0;';

    const btnStyle = 'width:28px;height:28px;border:none;border-radius:6px;background:rgba(255,255,255,0.15);cursor:pointer;color:#fff;font-size:14px;display:flex;align-items:center;justify-content:center;transition:background 150ms ease;';

    // Minimize button
    const minBtn = document.createElement('button');
    minBtn.type = 'button';
    minBtn.className = 'lf-conv-minimize';
    minBtn.setAttribute('aria-label', 'Minimize conversation');
    minBtn.style.cssText = btnStyle;
    minBtn.innerHTML = '<svg width="12" height="2" viewBox="0 0 12 2" fill="currentColor"><rect width="12" height="2" rx="1"/></svg>';
    minBtn.addEventListener('click', () => this._opts.onMinimize?.());

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'lf-conv-close';
    closeBtn.setAttribute('aria-label', 'Close conversation');
    closeBtn.style.cssText = btnStyle;
    closeBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/></svg>';
    closeBtn.addEventListener('click', () => this._opts.onClose?.());

    controls.appendChild(minBtn);
    controls.appendChild(closeBtn);

    this._element.appendChild(avatar);
    this._element.appendChild(titleArea);
    this._element.appendChild(controls);
    parent.appendChild(this._element);
  }

  setTitle(title: string): void {
    const el = this._element?.querySelector('.lf-conv-title') as HTMLElement | null;
    if (el) el.textContent = title;
  }

  destroy(): void {
    if (this._element?.parentNode) this._element.parentNode.removeChild(this._element);
    this._element = null;
  }
}
