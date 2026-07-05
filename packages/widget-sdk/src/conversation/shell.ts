/**
 * conversation/shell.ts — Conversation shell component.
 * Mounts into renderer lf-content. Owns header, body, footer, composer.
 * Responsive: floating (desktop), adaptive (tablet), fullscreen (mobile).
 */

import { BaseComponent }          from '../ui/component';
import { ConversationHeader }     from './header';
import { ConversationBody }       from './body';
import { ConversationFooter }     from './footer';
import { ConversationComposer }   from './composer';
import type { IResponsiveManager } from '../ui/types';

const SHELL_CSS = `
.lf-conv-shell {
  position: fixed;
  display: flex;
  flex-direction: column;
  background: var(--lf-bg, #ffffff);
  border-radius: var(--lf-radius, 12px);
  box-shadow: var(--lf-shadow, 0 8px 32px rgba(0,0,0,0.14));
  overflow: hidden;
  opacity: 0;
  transform: scale(0.95) translateY(8px);
  transition: opacity 200ms ease, transform 200ms ease;
  pointer-events: none;
}
.lf-conv-shell.lf-conv-visible {
  opacity: 1;
  transform: scale(1) translateY(0);
  pointer-events: auto;
}
.lf-conv-shell.lf-conv-minimized {
  height: auto !important;
  max-height: none !important;
}
.lf-conv-shell.lf-conv-fullscreen {
  border-radius: 0 !important;
  inset: 0 !important;
  width: 100% !important;
  max-width: 100% !important;
  height: 100% !important;
  max-height: 100% !important;
}
@media (prefers-reduced-motion: reduce) {
  .lf-conv-shell { transition: none; }
}
`.trim();

export interface ShellOptions {
  title:       string;
  subtitle?:   string;
  responsive?: IResponsiveManager;
  onMinimize?: () => void;
  onClose?:    () => void;
  onSend?:     (value: string) => void;
}

export class ConversationShell extends BaseComponent {
  private _header:   ConversationHeader;
  private _body:     ConversationBody;
  private _footer:   ConversationFooter;
  private _composer: ConversationComposer;
  private _shell:    HTMLElement | null = null;
  private _styleEl:  HTMLStyleElement | null = null;
  private _opts:     ShellOptions;
  private _visible   = false;
  private _minimized = false;

  constructor(opts: ShellOptions) {
    super('lf-conversation');
    this._opts     = opts;
    this._header   = new ConversationHeader({
      title:      opts.title,
      subtitle:   opts.subtitle,
      onMinimize: opts.onMinimize,
      onClose:    opts.onClose,
    });
    this._body     = new ConversationBody();
    this._footer   = new ConversationFooter();
    this._composer = new ConversationComposer({}, opts.onSend);
  }

  render(): void {
    if (!this._element) return;

    // Inject CSS
    const shadowRoot = this._element.getRootNode() as ShadowRoot | null;
    if (shadowRoot && 'appendChild' in shadowRoot) {
      this._styleEl = document.createElement('style');
      this._styleEl.setAttribute('data-lf-styles', 'conversation');
      this._styleEl.textContent = SHELL_CSS;
      shadowRoot.appendChild(this._styleEl);
    }

    // Shell container
    this._shell = document.createElement('div');
    this._shell.className = 'lf-conv-shell';
    this._shell.setAttribute('role', 'dialog');
    this._shell.setAttribute('aria-label', 'Chat conversation');
    this._shell.setAttribute('aria-modal', 'true');

    this._applyResponsiveStyles();

    this._header.mount(this._shell);
    this._body.mount(this._shell);
    this._footer.mount(this._shell);
    this._composer.mount(this._shell);

    this._element.appendChild(this._shell);

    // Escape key closes
    this._element.getRootNode()?.addEventListener?.('keydown', (e: Event) => {
      if ((e as KeyboardEvent).key === 'Escape') this._opts.onClose?.();
    });
  }

  private _applyResponsiveStyles(): void {
    if (!this._shell) return;
    const responsive = this._opts.responsive;
    const isMobile   = responsive?.isMobile()   ?? false;
    const isTablet   = responsive?.isTablet()    ?? false;

    if (isMobile) {
      this._shell.style.cssText = 'bottom:0;left:0;right:0;width:100%;height:85vh;border-radius:16px 16px 0 0;';
      this._shell.classList.add('lf-conv-fullscreen');
    } else if (isTablet) {
      this._shell.style.cssText = 'bottom:88px;right:16px;width:340px;height:540px;max-height:80vh;';
    } else {
      this._shell.style.cssText = 'bottom:88px;right:24px;width:380px;height:580px;max-height:85vh;';
    }
  }

  setVisible(visible: boolean): void {
    if (!this._shell) return;
    this._visible = visible;
    if (visible) {
      this._shell.classList.add('lf-conv-visible');
      this._composer.focus();
    } else {
      this._shell.classList.remove('lf-conv-visible');
    }
  }

  setMinimized(minimized: boolean): void {
    if (!this._shell) return;
    this._minimized = minimized;
    if (minimized) {
      this._shell.classList.add('lf-conv-minimized');
      // Hide body/footer/composer, keep header
      (this._shell.querySelector('.lf-conv-body')     as HTMLElement | null)?.style && ((this._shell.querySelector('.lf-conv-body') as HTMLElement).style.display = 'none');
      (this._shell.querySelector('.lf-conv-footer')   as HTMLElement | null)?.style && ((this._shell.querySelector('.lf-conv-footer') as HTMLElement).style.display = 'none');
      (this._shell.querySelector('.lf-conv-composer') as HTMLElement | null)?.style && ((this._shell.querySelector('.lf-conv-composer') as HTMLElement).style.display = 'none');
    } else {
      this._shell.classList.remove('lf-conv-minimized');
      (this._shell.querySelector('.lf-conv-body')     as HTMLElement | null)?.style && ((this._shell.querySelector('.lf-conv-body') as HTMLElement).style.display = '');
      (this._shell.querySelector('.lf-conv-footer')   as HTMLElement | null)?.style && ((this._shell.querySelector('.lf-conv-footer') as HTMLElement).style.display = '');
      (this._shell.querySelector('.lf-conv-composer') as HTMLElement | null)?.style && ((this._shell.querySelector('.lf-conv-composer') as HTMLElement).style.display = '');
    }
  }

  get body():     ConversationBody     { return this._body; }
  get composer(): ConversationComposer { return this._composer; }
  get isVisible(): boolean { return this._visible; }
  get isMinimized(): boolean { return this._minimized; }

  override destroy(): void {
    this._header.destroy();
    this._body.destroy();
    this._footer.destroy();
    this._composer.destroy();
    if (this._styleEl?.parentNode) this._styleEl.parentNode.removeChild(this._styleEl);
    super.destroy();
  }
}
