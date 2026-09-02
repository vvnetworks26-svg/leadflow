/**
 * calendarService.env.test.ts
 *
 * Regression test for the fix to a real production incident (marketing's
 * Sign In/Sign Up links silently pointed real visitors at localhost because
 * VITE_DASHBOARD_URL was left unset on that Vercel project). calendarService
 * used to compute its own `BASE_URL = env.VITE_API_URL || 'http://localhost:4000'`
 * inline, inside getAvailableSlots' try/catch — meaning a missing var in
 * production would have been swallowed into a silent "no slots available"
 * result, which is arguably worse than a wrong-but-visible localhost link.
 *
 * It now imports getApiUrl() from @leadflow/shared and resolves it at
 * module scope, outside that try/catch, so a production-missing var throws
 * at import time instead. @leadflow/shared's own loud-failure branching is
 * covered exhaustively in packages/shared/src/config/__tests__/appUrls.test.ts
 * — this test only proves THIS call site is actually wired to it, and that
 * the throw is not accidentally caught.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('@leadflow/shared');
  vi.doUnmock('../../api/widgetApiClient');
});

describe('calendarService — production missing-config behavior', () => {
  it('throws at import time when getApiUrl() throws (simulating prod + unset VITE_API_URL) — not swallowed into an empty slot list', async () => {
    vi.doMock('@leadflow/shared', () => ({
      getApiUrl: () => {
        throw new Error('Configuration error: VITE_API_URL is not set');
      },
    }));
    vi.doMock('../../api/widgetApiClient', () => ({
      widgetApiClient: { getConfig: vi.fn() },
    }));

    await expect(import('../calendarService')).rejects.toThrow(
      'Configuration error: VITE_API_URL is not set'
    );
  });

  it('loads normally and does not throw when getApiUrl() resolves (dev, or prod with the var set)', async () => {
    vi.doMock('@leadflow/shared', () => ({
      getApiUrl: () => 'https://api.leadflow.com',
    }));
    vi.doMock('../../api/widgetApiClient', () => ({
      widgetApiClient: { getConfig: vi.fn() },
    }));

    const { calendarService } = await import('../calendarService');
    expect(calendarService).toBeDefined();
    expect(typeof calendarService.getAvailableSlots).toBe('function');
  });
});
