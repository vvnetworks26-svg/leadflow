/**
 * appUrls.test.ts
 *
 * Regression coverage for the fix to a real production incident: marketing's
 * Sign In/Sign Up links silently pointed real visitors at localhost because
 * VITE_DASHBOARD_URL was unset on that Vercel project. resolveAppUrl() must
 * fall back to localhost only when NOT a production build — in production a
 * missing var must throw, never silently substitute localhost.
 *
 * resolveAppUrl is a pure function of plain values (not import.meta.env
 * reads) specifically so this can be asserted directly and deterministically
 * — import.meta.env is a build-time construct injected per-module by
 * Vite/Vitest and can't be reliably stubbed across module boundaries here
 * (confirmed empirically: vi.stubEnv changes are invisible to a separately
 * imported module, even after vi.resetModules() + a fresh dynamic import).
 * getDashboardUrl()/getApiUrl() are thin wrappers around this function and
 * the real import.meta.env read; they are exercised indirectly by every
 * call site that already imports them (Navbar, apiClient, etc.), plus a
 * light constant-wiring check below.
 */

import { describe, it, expect } from 'vitest';
import { resolveAppUrl, getDashboardUrl, getApiUrl } from '../appUrls';

describe('resolveAppUrl()', () => {
  it('non-prod + unset value falls back to the dev fallback', () => {
    expect(
      resolveAppUrl({ varName: 'VITE_DASHBOARD_URL', value: undefined, isProd: false, devFallback: 'http://localhost:3000' })
    ).toBe('http://localhost:3000');
  });

  it('non-prod + set value returns the configured value', () => {
    expect(
      resolveAppUrl({
        varName: 'VITE_DASHBOARD_URL',
        value: 'https://staging-dashboard.example.com',
        isProd: false,
        devFallback: 'http://localhost:3000',
      })
    ).toBe('https://staging-dashboard.example.com');
  });

  it('prod + unset value THROWS instead of falling back to localhost — the regression this fixes', () => {
    expect(() =>
      resolveAppUrl({ varName: 'VITE_DASHBOARD_URL', value: undefined, isProd: true, devFallback: 'http://localhost:3000' })
    ).toThrow('Configuration error: VITE_DASHBOARD_URL is not set');
  });

  it('prod + set value returns the configured value (no throw)', () => {
    expect(
      resolveAppUrl({
        varName: 'VITE_API_URL',
        value: 'https://api.leadflow.com',
        isProd: true,
        devFallback: 'http://localhost:4000',
      })
    ).toBe('https://api.leadflow.com');
  });

  it('prod + empty-string value is treated as unset and throws (not a valid URL)', () => {
    expect(() =>
      resolveAppUrl({ varName: 'VITE_API_URL', value: '', isProd: true, devFallback: 'http://localhost:4000' })
    ).toThrow('Configuration error: VITE_API_URL is not set');
  });
});

describe('getDashboardUrl() / getApiUrl() wiring', () => {
  it('are exported functions callable with no arguments', () => {
    // In this Vitest run PROD is false and neither VITE_* var is set, so both
    // resolve via the dev-fallback branch of resolveAppUrl (covered above) —
    // this just proves the two call sites are wired to the right var
    // name/fallback pair without crashing.
    expect(getDashboardUrl()).toBe('http://localhost:3000');
    expect(getApiUrl()).toBe('http://localhost:4000');
  });
});
