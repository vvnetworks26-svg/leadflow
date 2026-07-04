/**
 * bootstrap.ts
 *
 * Creates and mounts the LeadFlow widget root element.
 *
 * Responsibilities:
 *   - Create a single <div id="leadflow-widget-root"> element
 *   - Stamp it with diagnostic data-* attributes
 *   - Append it to document.body
 *   - Return the element so the runtime can store a reference
 *
 * What this module does NOT do:
 *   - No styling
 *   - No iframe
 *   - No React
 *   - No chat UI
 *   - No networking
 *
 * The root element is the single attachment point for all future widget layers.
 */

import { ROOT_ID } from './constants';
import type { WidgetConfig } from './types';

// Re-export ROOT_ID so existing imports of WIDGET_ROOT_ID from bootstrap still
// resolve — loader.ts imports from here for backwards compat.
export { ROOT_ID as WIDGET_ROOT_ID };

/**
 * Mount the widget root container.
 *
 * Creates `<div id="leadflow-widget-root">` and appends it to `document.body`.
 * Stamps diagnostic data-* attributes on the element.
 *
 * @returns The mounted HTMLDivElement.
 */
export function mountRoot(config: WidgetConfig): HTMLDivElement {
  const root = document.createElement('div');

  root.id = ROOT_ID;

  root.dataset['leadflowVersion'] = typeof __SDK_VERSION__ !== 'undefined'
    ? __SDK_VERSION__
    : '0.0.0';
  root.dataset['businessId']  = config.businessId;
  root.dataset['initialized'] = 'true';

  document.body.appendChild(root);

  return root;
}
