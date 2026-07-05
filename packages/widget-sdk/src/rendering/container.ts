/**
 * rendering/container.ts
 *
 * Builds and manages the widget DOM hierarchy inside ShadowRoot.
 *
 * Hierarchy:
 *   <div id="leadflow-widget-root">    ← provided by bootstrap.ts
 *     #shadow-root (closed: false)     ← attachShadow({ mode: 'open' })
 *       <style>…base CSS…</style>      ← injected by StyleManager
 *       <div class="lf-container">     ← positioning wrapper
 *         <div class="lf-content">     ← where future components mount
 *         </div>
 *       </div>
 *
 * ShadowRoot mode: 'open' so the SDK can access it via element.shadowRoot.
 * (Closed mode would prevent our own code from managing it.)
 *
 * CSS custom properties on .lf-container are updated by renderer.update()
 * — no full re-render needed for theme/position changes.
 */

import type { WidgetContainer } from './types';

// ─── Position utilities ───────────────────────────────────────────────────────

/**
 * Map a WidgetPosition string to the CSS positioning values applied to
 * .lf-container. The container is position: fixed on the :host (Shadow DOM),
 * so these are offsets within the viewport.
 */
function positionStyles(position: string): Partial<CSSStyleDeclaration> {
  switch (position) {
    case 'bottom-left':  return { bottom: '24px', left:  '24px', right: 'auto', top: 'auto' };
    case 'top-right':    return { top:    '24px', right: '24px', bottom: 'auto', left: 'auto' };
    case 'top-left':     return { top:    '24px', left:  '24px', bottom: 'auto', right: 'auto' };
    case 'bottom-right':
    default:             return { bottom: '24px', right: '24px', top: 'auto', left: 'auto' };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Attach a ShadowRoot to widgetRoot and build the container hierarchy.
 *
 * @param widgetRoot - The #leadflow-widget-root element from bootstrap.ts.
 * @param position   - Initial widget position.
 * @param primaryColor - Initial primary colour as a hex string.
 * @returns The fully constructed WidgetContainer.
 */
export function buildContainer(
  widgetRoot:   HTMLDivElement,
  position:     string,
  primaryColor: string
): WidgetContainer {
  // Attach Shadow DOM
  const shadowRoot = widgetRoot.attachShadow({ mode: 'open' });

  // Container div — owns position and CSS variables
  const container = document.createElement('div');
  container.className = 'lf-container';
  container.setAttribute('data-lf-position', position);

  // Apply position styles
  const pos = positionStyles(position);
  Object.assign(container.style, pos);
  container.style.setProperty('--lf-primary', primaryColor);
  container.style.position = 'fixed';

  // Content root — where future components will mount
  const contentRoot = document.createElement('div');
  contentRoot.className = 'lf-content';

  container.appendChild(contentRoot);
  shadowRoot.appendChild(container);

  return { widgetRoot, shadowRoot, container, contentRoot };
}

/**
 * Apply a configuration update to an existing WidgetContainer.
 * Only re-sets the affected CSS properties — no DOM rebuild.
 */
export function updateContainer(
  container:    WidgetContainer,
  position:     string | undefined,
  primaryColor: string | undefined
): void {
  if (position) {
    const pos = positionStyles(position);
    Object.assign(container.container.style, pos);
    container.container.setAttribute('data-lf-position', position);
  }
  if (primaryColor) {
    container.container.style.setProperty('--lf-primary', primaryColor);
  }
}

/**
 * Remove the container's contents and detach from the DOM.
 * The widgetRoot itself is managed by bootstrap.ts / loader.ts.
 */
export function teardownContainer(container: WidgetContainer): void {
  // Remove all children from the shadow root
  while (container.shadowRoot.firstChild) {
    container.shadowRoot.removeChild(container.shadowRoot.firstChild);
  }
}
