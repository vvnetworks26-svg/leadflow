/**
 * integration/compatibility.ts — Browser capability detection.
 *
 * Probes for feature support without polyfilling anything.
 * All results are non-fatal warnings — the widget degrades gracefully.
 * Never throws. Never blocks initialization.
 */

import type { BrowserCapabilities, CompatibilityResult } from './types';

// ─── Individual probes ────────────────────────────────────────────────────────

function probeShadowDOM(): boolean {
  try {
    return typeof Element !== 'undefined' &&
           typeof (Element.prototype as unknown as Record<string, unknown>)['attachShadow'] === 'function';
  } catch { return false; }
}

function probeWebAnimationsAPI(): boolean {
  try {
    return typeof Element !== 'undefined' &&
           typeof (Element.prototype as unknown as Record<string, unknown>)['animate'] === 'function';
  } catch { return false; }
}

function probeAbortController(): boolean {
  try { return typeof AbortController !== 'undefined'; }
  catch { return false; }
}

function probeFetch(): boolean {
  try { return typeof fetch !== 'undefined'; }
  catch { return false; }
}

function probeLocalStorage(): boolean {
  try {
    const k = '__lf_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch { return false; }
}

function probeResizeObserver(): boolean {
  try { return typeof ResizeObserver !== 'undefined'; }
  catch { return false; }
}

function probeIntersectionObserver(): boolean {
  try { return typeof IntersectionObserver !== 'undefined'; }
  catch { return false; }
}

function probeCustomElements(): boolean {
  try { return typeof customElements !== 'undefined'; }
  catch { return false; }
}

function probeCSSVariables(): boolean {
  try {
    return typeof CSS !== 'undefined' &&
           typeof CSS.supports === 'function' &&
           CSS.supports('--lf-probe', '1');
  } catch { return false; }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Detect all browser capabilities in a single pass.
 * Never throws. Safe to call at any point.
 */
export function detectCapabilities(): BrowserCapabilities {
  return {
    shadowDOM:            probeShadowDOM(),
    webAnimationsAPI:     probeWebAnimationsAPI(),
    abortController:      probeAbortController(),
    fetch:                probeFetch(),
    localStorage:         probeLocalStorage(),
    resizeObserver:       probeResizeObserver(),
    intersectionObserver: probeIntersectionObserver(),
    customElements:       probeCustomElements(),
    cssVariables:         probeCSSVariables(),
  };
}

/**
 * Run the full compatibility check.
 *
 * Shadow DOM is the only hard requirement — without it the widget cannot
 * render at all. Everything else degrades gracefully.
 */
export function checkCompatibility(): CompatibilityResult {
  const caps     = detectCapabilities();
  const warnings: string[] = [];
  const degraded: string[] = [];
  const missing:  string[] = [];

  // ── Hard requirements ────────────────────────────────────────────────────
  if (!caps.shadowDOM) {
    missing.push('Shadow DOM is required but not supported in this browser');
  }

  // ── Graceful degradation ─────────────────────────────────────────────────
  if (!caps.webAnimationsAPI) {
    degraded.push('webAnimationsAPI');
    warnings.push('Web Animations API not available — transitions will be instant');
  }

  if (!caps.resizeObserver) {
    degraded.push('resizeObserver');
    warnings.push('ResizeObserver not available — responsive layout will use window resize fallback');
  }

  if (!caps.intersectionObserver) {
    degraded.push('intersectionObserver');
    warnings.push('IntersectionObserver not available — visibility detection will be disabled');
  }

  if (!caps.localStorage) {
    degraded.push('localStorage');
    warnings.push('localStorage unavailable — preferences will not be persisted across sessions');
  }

  if (!caps.fetch) {
    degraded.push('fetch');
    warnings.push('fetch not available — API calls will use XMLHttpRequest fallback');
  }

  if (!caps.abortController) {
    degraded.push('abortController');
    warnings.push('AbortController not available — request cancellation will be unavailable');
  }

  const compatible = missing.length === 0;

  return { compatible, capabilities: caps, warnings, degraded, missing };
}
