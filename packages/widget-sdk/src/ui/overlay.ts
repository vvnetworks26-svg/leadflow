/**
 * ui/overlay.ts — Overlay Manager.
 * Manages stacked overlay layers (modal, tooltip, dropdown, toast).
 * Infrastructure only — no concrete overlays.
 */

import { eventBus }    from '../eventBus';
import { WidgetEvent } from '../events';
import { ZIndex }      from './tokens';
import type { IOverlayManager, OverlayLayer, OverlayLayerType } from './types';

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

const Z_BY_TYPE: Record<OverlayLayerType, number> = {
  tooltip:  ZIndex.tooltip,
  toast:    ZIndex.toast,
  modal:    ZIndex.modal,
  dropdown: ZIndex.overlay,
};

export function createOverlayManager(): IOverlayManager {
  const _layers = new Map<string, OverlayLayer>();

  return {
    createLayer(type: OverlayLayerType, root: HTMLElement): OverlayLayer {
      const id      = uuid();
      const zIndex  = Z_BY_TYPE[type];
      const element = document.createElement('div');
      element.setAttribute('data-lf-overlay', type);
      element.setAttribute('data-lf-overlay-id', id);
      element.style.position = 'absolute';
      element.style.zIndex   = String(zIndex);
      root.appendChild(element);

      const layer: OverlayLayer = Object.freeze({
        id, type, element, zIndex,
        createdAt: new Date().toISOString(),
      });
      _layers.set(id, layer);

      eventBus.emit(WidgetEvent.OVERLAY_CREATED, {
        timestamp: new Date().toISOString(),
        overlayId: id,
        type,
        zIndex,
      });

      return layer;
    },

    removeLayer(id: string): void {
      const layer = _layers.get(id);
      if (!layer) return;
      if (layer.element.parentNode) {
        layer.element.parentNode.removeChild(layer.element);
      }
      _layers.delete(id);

      eventBus.emit(WidgetEvent.OVERLAY_REMOVED, {
        timestamp: new Date().toISOString(),
        overlayId: id,
      });
    },

    getLayer(id: string): OverlayLayer | undefined {
      return _layers.get(id);
    },

    count(): number {
      return _layers.size;
    },

    clear(): void {
      for (const id of Array.from(_layers.keys())) {
        this.removeLayer(id);
      }
    },
  };
}
