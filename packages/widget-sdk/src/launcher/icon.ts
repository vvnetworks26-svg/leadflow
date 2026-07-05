/**
 * launcher/icon.ts — Icon system.
 * Default LeadFlow chat bubble icon. Theme-aware via CSS variables.
 * SVG uses currentColor so the theme engine drives the colour.
 */

import type { LauncherIcon } from './types';

/** Default LeadFlow chat bubble SVG. Uses currentColor for theme-awareness. */
export const DEFAULT_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;

/** Close / X icon shown when chat is open. */
export const CLOSE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

export const DEFAULT_ICON: Readonly<LauncherIcon> = Object.freeze({
  svg:   DEFAULT_ICON_SVG,
  label: 'Open chat',
});

export const CLOSE_ICON: Readonly<LauncherIcon> = Object.freeze({
  svg:   CLOSE_ICON_SVG,
  label: 'Close chat',
});

/**
 * Render an icon into a container element.
 * Clears existing content and inserts the SVG safely.
 */
export function renderIcon(container: HTMLElement, icon: LauncherIcon): void {
  container.innerHTML = icon.svg;
  container.setAttribute('aria-label', icon.label);
}
