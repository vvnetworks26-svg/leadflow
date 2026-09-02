/**
 * Navbar.env.test.ts
 *
 * Regression test for the actual production incident this change fixes:
 * marketing's Sign In/Sign Up links silently pointed real visitors at
 * localhost because VITE_DASHBOARD_URL was left unset on that Vercel
 * project. Navbar now reads its dashboard URL from @leadflow/shared's
 * getDashboardUrl() instead of `import.meta.env.VITE_DASHBOARD_URL ?? 'http://localhost:3000'`
 * — getDashboardUrl()'s own dev/prod branching is covered exhaustively in
 * packages/shared/src/config/__tests__/appUrls.test.ts; this only proves
 * Navbar is actually wired to it.
 *
 * Navbar has no hooks/state, so it can be invoked directly as a plain
 * function (React function components are just functions) without
 * rendering to a DOM — no jsdom/testing-library needed.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('@leadflow/shared');
});

describe('Navbar — production missing-config behavior', () => {
  it('throws when getDashboardUrl() throws (simulating prod + unset VITE_DASHBOARD_URL) instead of rendering a localhost link', async () => {
    vi.doMock('@leadflow/shared', () => ({
      getDashboardUrl: () => {
        throw new Error('Configuration error: VITE_DASHBOARD_URL is not set');
      },
    }));

    const { default: Navbar } = await import('../Navbar');
    expect(() => Navbar({})).toThrow('Configuration error: VITE_DASHBOARD_URL is not set');
  });

  it('does not throw when getDashboardUrl() resolves (dev, or prod with the var set)', async () => {
    vi.doMock('@leadflow/shared', () => ({
      getDashboardUrl: () => 'https://app.leadflow.com',
    }));

    const { default: Navbar } = await import('../Navbar');
    expect(() => Navbar({})).not.toThrow();
  });
});
