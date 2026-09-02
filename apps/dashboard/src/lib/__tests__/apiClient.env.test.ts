/**
 * apiClient.env.test.ts
 *
 * Regression test for the actual production incident this change fixes:
 * marketing's Sign In/Sign Up links silently pointed real visitors at
 * localhost because a VITE_* URL var was left unset on a Vercel project.
 * apiClient.ts now resolves its BASE_URL via @leadflow/shared's getApiUrl()
 * at module scope instead of `import.meta.env.VITE_API_URL ?? 'http://localhost:4000'`
 * — getApiUrl()'s own dev/prod branching is covered exhaustively in
 * packages/shared/src/config/__tests__/appUrls.test.ts; this only proves
 * apiClient.ts is actually wired to it, and that a missing var in
 * production fails the module load rather than silently defaulting.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('@leadflow/shared');
});

describe('apiClient — production missing-config behavior', () => {
  it('throws at import time when getApiUrl() throws (simulating prod + unset VITE_API_URL)', async () => {
    vi.doMock('@leadflow/shared', () => ({
      getApiUrl: () => {
        throw new Error('Configuration error: VITE_API_URL is not set');
      },
    }));

    await expect(import('../apiClient')).rejects.toThrow('Configuration error: VITE_API_URL is not set');
  });

  it('loads normally with the configured baseURL when getApiUrl() resolves', async () => {
    vi.doMock('@leadflow/shared', () => ({
      getApiUrl: () => 'https://api.leadflow.com',
    }));

    const { apiClient } = await import('../apiClient');
    expect(apiClient.defaults.baseURL).toBe('https://api.leadflow.com/api/v1');
  });
});
