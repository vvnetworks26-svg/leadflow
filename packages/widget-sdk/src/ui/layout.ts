/**
 * ui/layout.ts — Layout Engine.
 * Returns frozen CSS-in-JS style objects for generic layout primitives.
 */

import { Spacing } from './tokens';
import type { ILayoutEngine, LayoutAlign } from './types';

function alignValue(a: LayoutAlign): string {
  return a === 'between' ? 'space-between' : a;
}

export function createLayoutEngine(): ILayoutEngine {
  return {
    stack(options = {}): Readonly<Record<string, string>> {
      return Object.freeze({
        display:       'flex',
        flexDirection: 'column',
        gap:           options.gap !== undefined ? `${options.gap * 4}px` : Spacing[2],
        alignItems:    options.align ? alignValue(options.align) : 'stretch',
      });
    },
    row(options = {}): Readonly<Record<string, string>> {
      return Object.freeze({
        display:       'flex',
        flexDirection: 'row',
        gap:           options.gap !== undefined ? `${options.gap * 4}px` : Spacing[2],
        alignItems:    options.align   ? alignValue(options.align)   : 'center',
        justifyContent:options.justify ? alignValue(options.justify) : 'flex-start',
        flexWrap:      options.wrap ? 'wrap' : 'nowrap',
      });
    },
    column(options = {}): Readonly<Record<string, string>> {
      return Object.freeze({
        display:        'flex',
        flexDirection:  'column',
        gap:            options.gap !== undefined ? `${options.gap * 4}px` : Spacing[2],
        alignItems:     options.align   ? alignValue(options.align)   : 'stretch',
        justifyContent: options.justify ? alignValue(options.justify) : 'flex-start',
      });
    },
    center(): Readonly<Record<string, string>> {
      return Object.freeze({
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
      });
    },
    spacer(size: number): Readonly<Record<string, string>> {
      const px = `${size * 4}px`;
      return Object.freeze({ display: 'block', width: px, height: px, flexShrink: '0' });
    },
    container(maxWidth = 480): Readonly<Record<string, string>> {
      return Object.freeze({
        width:    '100%',
        maxWidth: `${maxWidth}px`,
        margin:   '0 auto',
        padding:  `0 ${Spacing[4]}`,
      });
    },
    panel(): Readonly<Record<string, string>> {
      return Object.freeze({
        display:      'flex',
        flexDirection:'column',
        width:        '100%',
        overflow:     'hidden',
      });
    },
  };
}
