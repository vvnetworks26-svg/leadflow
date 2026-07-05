/**
 * rendering/types.ts
 *
 * All types for the Widget Renderer.
 * Pure contracts — no implementation.
 */

// ─── Renderer state ───────────────────────────────────────────────────────────

export type RendererState =
  | 'idle'       // created but not yet mounted
  | 'mounting'   // mount in progress
  | 'mounted'    // fully mounted and ready for content
  | 'updating'   // update in progress
  | 'unmounting' // unmount in progress
  | 'unmounted'; // fully removed from DOM

export type RendererStatus = {
  state:       RendererState;
  mountedAt:   string | null;
  renderCount: number;
};

// ─── Widget container ─────────────────────────────────────────────────────────

/**
 * The full DOM hierarchy managed by the renderer.
 *
 * <div id="leadflow-widget-root">            ← widgetRoot (already created by bootstrap)
 *   #shadow-root                             ← shadowRoot
 *     <div class="lf-container">            ← container
 *       <div class="lf-content"></div>      ← contentRoot
 *     </div>
 */
export interface WidgetContainer {
  /** The outer host element (#leadflow-widget-root). */
  readonly widgetRoot:  HTMLDivElement;
  /** The Shadow DOM root attached to widgetRoot. */
  readonly shadowRoot:  ShadowRoot;
  /** The inner container div (.lf-container). */
  readonly container:   HTMLDivElement;
  /** The content mounting point (.lf-content). */
  readonly contentRoot: HTMLDivElement;
}

// ─── Style manager ────────────────────────────────────────────────────────────

export interface StyleManager {
  /** Inject base styles into the ShadowRoot. */
  inject(shadowRoot: ShadowRoot): void;
  /** Remove injected styles. */
  remove(): void;
  /** Returns true when styles have been injected. */
  isInjected(): boolean;
}

// ─── Renderer ────────────────────────────────────────────────────────────────

export interface IRenderer {
  /** Mount the rendering hierarchy onto the given root element. */
  render(widgetRoot: HTMLDivElement): void;
  /** Apply a configuration update (e.g. theme/position change). */
  update(changes: Partial<RenderUpdate>): void;
  /** Tear down the rendering hierarchy. */
  destroy(): void;
  /** Returns true when the renderer is currently mounted. */
  isMounted(): boolean;
  /** Returns the current WidgetContainer, or null if not mounted. */
  getContainer(): WidgetContainer | null;
  /** Returns the content root element where future components will mount. */
  getRoot(): HTMLDivElement | null;
  /** Returns current status. */
  getStatus(): RendererStatus;
}

// ─── Render update ────────────────────────────────────────────────────────────

export interface RenderUpdate {
  /** New theme to apply. */
  theme:        string;
  /** New position to apply. */
  position:     string;
  /** New primary colour to apply. */
  primaryColor: string;
}

// ─── Renderer diagnostics ─────────────────────────────────────────────────────

export interface RenderDiagnostics {
  /** Whether the renderer is currently mounted. */
  mounted:        boolean;
  /** Whether a ShadowRoot is attached. */
  shadowDOM:      boolean;
  /** Whether the inner container is ready. */
  containerReady: boolean;
  /** Whether base styles have been injected. */
  stylesInjected: boolean;
  /** Total number of render()/update() calls. */
  renderCount:    number;
}
