/**
 * BusinessIdentityService.test.ts
 *
 * Proves that a repository failure (e.g. a Business document with data
 * that fails BusinessIdentityFactory's Zod validation) is surfaced at
 * error level with the organizationId and the specific validation
 * failure — not silently swallowed at warn level. Losing BusinessIdentity
 * disables the entire Layer 3 orchestration engine for that org, so this
 * must be loud.
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { ZodError, z } from 'zod';
import { BusinessIdentityService, setRepository } from '../BusinessIdentityService';
import { businessIdentityCache } from '../cache/BusinessIdentityCache';
import { logger } from '../../utils/logger';
import type { IBusinessIdentityRepository } from '../repository/BusinessIdentityRepository';

function makeZodError(): ZodError {
  const result = z.object({ phone: z.string().min(7).max(20) }).safeParse({ phone: '123' });
  assert.equal(result.success, false);
  return (result as any).error as ZodError;
}

describe('BusinessIdentityService.load() — failure visibility', () => {
  let errorMock: ReturnType<typeof mock.method>;

  beforeEach(() => {
    businessIdentityCache.clear();
    errorMock = mock.method(logger, 'error', () => {});
  });

  afterEach(() => {
    errorMock.mock.restore();
  });

  it('logs at error level (not warn) when the repository throws, and returns null', async () => {
    const warnMock = mock.method(logger, 'warn', () => {});
    const zodErr = makeZodError();

    const failingRepo: IBusinessIdentityRepository = {
      async loadByOrganizationId() {
        throw zodErr;
      },
    };
    setRepository(failingRepo);

    const result = await BusinessIdentityService.load('org-broken-phone');

    assert.equal(result, null);
    assert.equal(errorMock.mock.calls.length, 1, 'logger.error should be called exactly once');
    assert.equal(warnMock.mock.calls.length, 0, 'logger.warn must NOT be used for this failure');

    warnMock.mock.restore();
  });

  it('the error log includes the organizationId and the specific Zod validation issue', async () => {
    const zodErr = makeZodError();
    const failingRepo: IBusinessIdentityRepository = {
      async loadByOrganizationId() {
        throw zodErr;
      },
    };
    setRepository(failingRepo);

    await BusinessIdentityService.load('org-xyz-123');

    const [logPayload, message] = errorMock.mock.calls[0].arguments as [any, string];
    assert.equal(logPayload.organizationId, 'org-xyz-123');
    assert.ok(Array.isArray(logPayload.validationIssues), 'validationIssues should be a flattened array');
    assert.ok(logPayload.validationIssues.some((i: any) => i.path === 'phone'));
    assert.match(message, /Layer 3 orchestration is DISABLED/);
  });
});
