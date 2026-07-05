/**
 * ui/theme.ts — Theme Engine.
 * Supports light / dark / auto (follows prefers-color-scheme).
 */

import { eventBus }    from '../eventBus';
import { WidgetEvent } from '../events';
import type { IThemeEngine, ThemeMode, ResolvedTheme } from './types';

export function createThemeEngine(): IThemeEngine {
  let _mode: ThemeMode = 'auto';
  const _listeners: Set<(r: ResolvedTheme) => void> = new Set();

  function _resolve(): ResolvedTheme {
    if (_mode === 'light') return 'light';
    if (_mode === 'dark')  return 'dark';
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  }

  function _notify(resolved: ResolvedTheme): void {
    for (const cb of _listeners) {
      try { cb(resolved); } catch { /* isolate */ }
    }
    eventBus.emit(WidgetEvent.THEME_CHANGED, {
      timestamp: new Date().toISOString(),
      mode:      _mode,
      resolved,
    });
  }

  // Track system preference changes when mode=auto
  let _mql: MediaQueryList | null = null;
  const _onSystemChange = () => { if (_mode === 'auto') _notify(_resolve()); };

  if (typeof window !== 'undefined' && window.matchMedia) {
    _mql = window.matchMedia('(prefers-color-scheme: dark)');
    _mql.addEventListener('change', _onSystemChange);
  }

  return {
    setTheme(mode: ThemeMode): void {
      if (_mode === mode) return;
      _mode = mode;
      _notify(_resolve());
    },
    getTheme(): ThemeMode   { return _mode; },
    resolveTheme(): ResolvedTheme { return _resolve(); },
    subscribe(cb): () => void {
      _listeners.add(cb);
      return () => _listeners.delete(cb);
    },
    unsubscribe(cb): void { _listeners.delete(cb); },
  };
}
