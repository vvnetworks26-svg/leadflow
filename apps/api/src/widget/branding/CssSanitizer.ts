/**
 * CssSanitizer.ts
 *
 * Sanitizes organization-provided custom CSS to prevent XSS and style injection.
 * Strips: <script>, javascript:, expression(), @import, behavior:, url() with data:
 * Allows: safe CSS properties, animations, media queries, custom variables.
 */

const BLOCKED_PATTERNS = [
  /<script[\s\S]*?>/gi,
  /<\/script>/gi,
  /javascript\s*:/gi,
  /expression\s*\(/gi,
  /@import/gi,
  /behavior\s*:/gi,
  /url\s*\(\s*['"]?\s*data:/gi,
  /vbscript\s*:/gi,
  /-moz-binding/gi,
  /\bposition\s*:\s*fixed\b/gi,     // prevent full-page overlays
  /\bz-index\s*:\s*\d{5,}/gi,      // prevent extreme z-index
];

const MAX_CSS_LENGTH = 10_000;

/**
 * Sanitize custom CSS input from an organization.
 * Returns a safe CSS string with blocked patterns removed.
 */
export function sanitizeCss(input: string): string {
  if (!input || typeof input !== 'string') return '';

  let css = input.slice(0, MAX_CSS_LENGTH);

  for (const pattern of BLOCKED_PATTERNS) {
    css = css.replace(pattern, '/* [blocked] */');
  }

  return css.trim();
}

/**
 * Validate a hex color string.
 */
export function isValidHexColor(color: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(color);
}

/**
 * Validate an HTTPS URL for asset references.
 */
export function isValidAssetUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Strip any <script> tags from HTML strings (e.g. custom button HTML).
 */
export function sanitizeHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<script[^>]*>/gi, '')
    .replace(/on\w+\s*=/gi, 'data-blocked=')
    .replace(/javascript\s*:/gi, '#');
}
