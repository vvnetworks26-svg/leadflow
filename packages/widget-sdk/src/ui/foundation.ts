/**
 * ui/foundation.ts — UI Foundation singleton.
 * Central UI subsystem — owns all UI engines.
 */

import { createThemeEngine }      from './theme';
import { createLayoutEngine }     from './layout';
import { createAnimationEngine }  from './animation';
import { createOverlayManager }   from './overlay';
import { createFocusManager }     from './focus';
import { createResponsiveManager }from './responsive';
import type { IUIFoundation, IComponent, UIFoundationDiagnostics } from './types';

export function createUIFoundation(): IUIFoundation {
  const _theme      = createThemeEngine();
  const _layout     = createLayoutEngine();
  const _animation  = createAnimationEngine();
  const _overlay    = createOverlayManager();
  const _focus      = createFocusManager();
  const _responsive = createResponsiveManager();
  const _components = new Map<string, IComponent>();

  return {
    get theme()       { return _theme; },
    get layout()      { return _layout; },
    get animation()   { return _animation; },
    get overlay()     { return _overlay; },
    get focus()       { return _focus; },
    get responsive()  { return _responsive; },

    registerComponent(component: IComponent): void {
      _components.set(component.id, component);
    },

    unregisterComponent(id: string): void {
      _components.delete(id);
    },

    getDiagnostics(): UIFoundationDiagnostics {
      const vp = _responsive.getViewport();
      return {
        activeTheme:      _theme.resolveTheme(),
        themeMode:        _theme.getTheme(),
        layoutMode:       'flex',
        overlayCount:     _overlay.count(),
        activeAnimations: _animation.activeCount(),
        viewport:         `${vp.width}x${vp.height} (${vp.breakpoint})`,
        componentCount:   _components.size,
      };
    },
  };
}
