/**
 * launcher/position.ts — Position manager.
 * Maps LauncherPosition to CSS styles applied to the launcher wrapper.
 * Uses design token spacing. No hardcoded values.
 */

import { Spacing } from '../ui/tokens';
import type { LauncherPosition } from './types';

export interface PositionStyles {
  top:    string;
  right:  string;
  bottom: string;
  left:   string;
}

const OFFSET = Spacing[6]; // 24px

export function getPositionStyles(position: LauncherPosition): PositionStyles {
  switch (position) {
    case 'bottom-right':  return { bottom: OFFSET, right: OFFSET, top: 'auto', left: 'auto' };
    case 'bottom-left':   return { bottom: OFFSET, left:  OFFSET, top: 'auto', right: 'auto' };
    case 'top-right':     return { top:    OFFSET, right: OFFSET, bottom: 'auto', left: 'auto' };
    case 'top-left':      return { top:    OFFSET, left:  OFFSET, bottom: 'auto', right: 'auto' };
    case 'center-right':  return { top:    '50%',  right: OFFSET, bottom: 'auto', left: 'auto' };
    case 'center-left':   return { top:    '50%',  left:  OFFSET, bottom: 'auto', right: 'auto' };
    default:              return { bottom: OFFSET, right: OFFSET, top: 'auto', left: 'auto' };
  }
}

export class PositionManager {
  private _position: LauncherPosition;
  private _element:  HTMLElement | null = null;

  constructor(initial: LauncherPosition = 'bottom-right') {
    this._position = initial;
  }

  attach(element: HTMLElement): void {
    this._element = element;
    this._apply();
  }

  setPosition(position: LauncherPosition): void {
    this._position = position;
    this._apply();
  }

  getPosition(): LauncherPosition {
    return this._position;
  }

  private _apply(): void {
    if (!this._element) return;
    const s = getPositionStyles(this._position);
    this._element.style.position = 'fixed';
    this._element.style.top      = s.top;
    this._element.style.right    = s.right;
    this._element.style.bottom   = s.bottom;
    this._element.style.left     = s.left;
    // Center-* positions need a vertical translate
    if (this._position.startsWith('center')) {
      this._element.style.transform = 'translateY(-50%)';
    } else {
      this._element.style.transform = '';
    }
    this._element.setAttribute('data-lf-position', this._position);
  }
}
