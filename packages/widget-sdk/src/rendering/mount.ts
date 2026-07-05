/**
 * rendering/mount.ts
 *
 * Mount lifecycle helpers.
 * These are thin wrappers that emit events around container construction.
 *
 * Separated from renderer.ts so the mount logic is independently testable.
 */

import { buildContainer, teardownContainer } from './container';
import { createStyleManager }               from './styles';
import { eventBus }                          from '../eventBus';
import { WidgetEvent }                       from '../events';
import type { WidgetContainer, StyleManager } from './types';

export interface MountResult {
  container:    WidgetContainer;
  styleManager: StyleManager;
}

/**
 * Mount the rendering hierarchy onto widgetRoot.
 * Emits RENDERER_MOUNTED after successful mount.
 */
export function mount(
  widgetRoot:   HTMLDivElement,
  position:     string,
  primaryColor: string
): MountResult {
  const container    = buildContainer(widgetRoot, position, primaryColor);
  const styleManager = createStyleManager();
  styleManager.inject(container.shadowRoot);

  eventBus.emit(WidgetEvent.RENDERER_MOUNTED, {
    timestamp:  new Date().toISOString(),
    elementId:  widgetRoot.id,
    shadowDOM:  true,
  });

  return { container, styleManager };
}

/**
 * Unmount the rendering hierarchy.
 * Emits RENDERER_UNMOUNTED after teardown.
 */
export function unmount(
  container:    WidgetContainer,
  styleManager: StyleManager
): void {
  styleManager.remove();
  teardownContainer(container);

  eventBus.emit(WidgetEvent.RENDERER_UNMOUNTED, {
    timestamp: new Date().toISOString(),
    elementId: container.widgetRoot.id,
  });
}
