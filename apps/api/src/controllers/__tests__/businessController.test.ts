/**
 * businessController.test.ts
 *
 * Proves a malformed Business.phone is rejected at the write path
 * (PUT/PATCH /api/v1/business) — before it can ever reach
 * BusinessModel.findOneAndUpdate() / BusinessIdentityFactory — instead of
 * being silently saved and only discovered later when
 * BusinessIdentityService.load() fails at read time and disables Layer 3.
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { upsert } from '../businessController';
import { BusinessService } from '../../services/BusinessService';
import { UpsertBusinessSchema } from '../../dto/business.dto';

function makeReqRes(body: unknown) {
  const req = { organizationId: 'org-1', body } as any;
  const jsonCalls: unknown[] = [];
  const res = { json: (payload: unknown) => { jsonCalls.push(payload); } } as any;
  let nextErr: unknown = undefined;
  const next = (err?: unknown) => { nextErr = err; };
  return { req, res, next, jsonCalls, getError: () => nextErr };
}

describe('UpsertBusinessSchema (dto)', () => {
  it('accepts a valid phone', () => {
    assert.equal(UpsertBusinessSchema.safeParse({ phone: '555-010-2000' }).success, true);
  });

  it('accepts an omitted phone (progressive save)', () => {
    assert.equal(UpsertBusinessSchema.safeParse({ companyName: 'Acme' }).success, true);
  });

  it('accepts an empty-string phone (not-yet-set, not malformed)', () => {
    assert.equal(UpsertBusinessSchema.safeParse({ phone: '' }).success, true);
  });

  it('rejects a too-short phone', () => {
    const result = UpsertBusinessSchema.safeParse({ phone: '123' });
    assert.equal(result.success, false);
  });

  it('rejects a too-long phone', () => {
    const result = UpsertBusinessSchema.safeParse({ phone: '1'.repeat(21) });
    assert.equal(result.success, false);
  });
});

describe('businessController.upsert() — write-path validation', () => {
  it('rejects a malformed phone with 422 and never calls BusinessService.upsert()', async () => {
    const upsertMock = mock.method(BusinessService, 'upsert', async () => ({}) as any);
    try {
      const { req, res, next, getError } = makeReqRes({ companyName: 'Acme', phone: '123' });
      await upsert(req, res, next);

      const err = getError() as any;
      assert.ok(err, 'next() should receive an error');
      assert.equal(err.statusCode, 422);
      assert.equal(err.code, 'VALIDATION_ERROR');
      assert.match(err.message, /phone/);
      assert.equal(upsertMock.mock.calls.length, 0, 'BusinessService.upsert must never be called for a malformed phone');
    } finally {
      upsertMock.mock.restore();
    }
  });

  it('allows a valid phone through to BusinessService.upsert()', async () => {
    const upsertMock = mock.method(BusinessService, 'upsert', async () => ({ companyName: 'Acme', phone: '555-010-2000' }) as any);
    try {
      const { req, res, next, jsonCalls, getError } = makeReqRes({ companyName: 'Acme', phone: '555-010-2000' });
      await upsert(req, res, next);

      assert.equal(getError(), undefined);
      assert.equal(upsertMock.mock.calls.length, 1);
      assert.equal(jsonCalls.length, 1);
    } finally {
      upsertMock.mock.restore();
    }
  });

  it('allows saving with no phone at all (progressive onboarding save)', async () => {
    const upsertMock = mock.method(BusinessService, 'upsert', async () => ({ companyName: 'Acme' }) as any);
    try {
      const { req, res, next, getError } = makeReqRes({ companyName: 'Acme' });
      await upsert(req, res, next);

      assert.equal(getError(), undefined);
      assert.equal(upsertMock.mock.calls.length, 1);
    } finally {
      upsertMock.mock.restore();
    }
  });
});
