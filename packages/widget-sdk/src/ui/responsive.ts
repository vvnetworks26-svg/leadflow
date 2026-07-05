/**
 * ui/responsive.ts — Responsive Manager.
 * Viewport detection and breakpoint helpers. Framework-independent.
 */

import { eventBus }      from '../eventBus';
import { WidgetEvent }   from '../events';
import { Breakpoints }   from './tokens';
import type { IResponsiveManager, ViewportInfo, BreakpointName } from './types';

function getBreakpoint(width: number): BreakpointName {
  if (width >= Breakpoints.desktop) return 'desktop';
  if (width >= Breakpoints.tablet)  return 'tablet';
  return 'mobile';
}

function currentViewport(): ViewportInfo {
  const width  = typeof window !== 'undefined' ? window.innerWidth  : 1024;
  const height = typeof window !== 'undefined' ? window.innerHeight : 768;
  return { width, height, breakpoint: getBreakpoint(width) };
}

export function createResponsiveManager(): IResponsiveManager {
  const _listeners: Set<(v: ViewportInfo) => void> = new Set();
  let _current = currentViewport();

  const _onResize = () => {
    const next = currentViewport();
    const bpChanged = next.breakpoint !== _current.breakpoint;
    _current = next;
    for (const cb of _listeners) {
      try { cb(next); } catch { /* isolate */ }
    }
    if (bpChanged) {
      eventBus.emit(WidgetEvent.RESPONSIVE_CHANGED, {
        timestamp:  new Date().toISOString(),
        breakpoint: next.breakpoint,
        width:      next.width,
        height:     next.height,
      });
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', _onResize, { passive: true });
  }

  return {
    getViewport(): ViewportInfo        { return currentViewport(); },
    isMobile():   boolean              { return currentViewport().breakpoint === 'mobile'; },
    isTablet():   boolean              { return currentViewport().breakpoint === 'tablet'; },
    isDesktop():  boolean              { return currentViewport().breakpoint === 'desktop'; },
    subscribe(cb): () => void {
      _listeners.add(cb);
      return () => _listeners.delete(cb);
    },
    unsubscribe(cb): void { _listeners.delete(cb); },
  };
}
