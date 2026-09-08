/**
 * CalendarConnectionService.tenantIsolation.test.ts
 *
 * Regression test for a confirmed cross-tenant IDOR: getProviderForConnection()
 * used to fetch a CalendarConnection by _id alone (CalendarConnectionModel.findById),
 * with no organizationId check, then selected its real OAuth access/refresh
 * tokens. reconnect()/syncCalendars() called it directly with a client-supplied
 * connection id, and their own follow-up findByIdAndUpdate() writes were
 * equally unscoped — so any authenticated org could supply another org's
 * connection id and have the server fetch that org's real OAuth tokens, call
 * the real Google/Microsoft API with them, and write status/calendar changes
 * back to that other org's document.
 *
 * Fix: getProviderForConnection() now requires organizationId and queries
 * findOne({_id, organizationId}); reconnect()/syncCalendars() validate
 * ownership via getById() up front and scope every subsequent write.
 *
 * These tests mock the Mongoose model directly so the org-scoping is
 * verified against the real query filters the service sends, not against a
 * reimplementation of the fix's own logic.
 */

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { CalendarConnectionModel } from '../../../models/CalendarConnection.model';
import { CalendarConnectionService } from '../CalendarConnectionService';
import { ApiError } from '../../../middleware/errorHandler';

const ORG_A     = 'org-aaaaaaaaaaaaaaaaaaaaaaaa';
const ORG_B     = 'org-bbbbbbbbbbbbbbbbbbbbbbbb';
const CONN_B_ID = 'conn-bbbbbbbbbbbbbbbbbbbbbbbb';

// provider: 'manual' takes ProviderFactory's default branch (ManualProvider) —
// no real network call, keeping this test fully offline regardless of which
// org's connection is legitimately reached.
const orgBConnection = {
  _id:            CONN_B_ID,
  organizationId: ORG_B,
  userId:         'user-b',
  provider:       'manual',
  status:         'connected',
  accessToken:    'org-b-real-access-token',
  refreshToken:   'org-b-real-refresh-token',
  toJSON() { return this; },
};

function chainable(value: unknown) {
  // Mimics the small slice of the Mongoose query-builder chain actually used
  // (.select().lean() in ProviderFactory; bare await elsewhere).
  const p: any = Promise.resolve(value);
  p.select = () => p;
  p.lean   = () => Promise.resolve(value);
  return p;
}

function matches(filter: any, doc: typeof orgBConnection): boolean {
  return filter._id === doc._id && filter.organizationId === doc.organizationId;
}

describe('CalendarConnectionService — tenant isolation (IDOR regression)', () => {
  let findOneMock: ReturnType<typeof mock.method>;
  let findOneAndUpdateMock: ReturnType<typeof mock.method>;

  beforeEach(() => {
    findOneMock = mock.method(CalendarConnectionModel, 'findOne', (filter: any) =>
      chainable(matches(filter, orgBConnection) ? orgBConnection : null));
    findOneAndUpdateMock = mock.method(CalendarConnectionModel, 'findOneAndUpdate', (filter: any) =>
      chainable(matches(filter, orgBConnection) ? orgBConnection : null));
  });

  afterEach(() => {
    findOneMock.mock.restore();
    findOneAndUpdateMock.mock.restore();
  });

  it('reconnect(): org A cannot reconnect org B\'s connection — 404, not a leak', async () => {
    await assert.rejects(
      () => CalendarConnectionService.reconnect(ORG_A, CONN_B_ID),
      (err: unknown) => {
        assert.ok(err instanceof ApiError, 'must reject with ApiError');
        assert.equal((err as ApiError).statusCode, 404);
        return true;
      },
    );

    // Every query the service issued must have carried the CALLER's org
    // (ORG_A) — never ORG_B, and never omitted org entirely.
    for (const call of findOneMock.mock.calls) {
      assert.equal((call.arguments[0] as any).organizationId, ORG_A);
    }
    for (const call of findOneAndUpdateMock.mock.calls) {
      assert.equal((call.arguments[0] as any).organizationId, ORG_A);
    }
  });

  it('syncCalendars(): org A cannot sync org B\'s connection — 404, not a leak', async () => {
    await assert.rejects(
      () => CalendarConnectionService.syncCalendars(ORG_A, CONN_B_ID),
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.equal((err as ApiError).statusCode, 404);
        return true;
      },
    );
    for (const call of findOneAndUpdateMock.mock.calls) {
      assert.equal((call.arguments[0] as any).organizationId, ORG_A);
    }
  });

  it('reconnect(): org B CAN reconnect its own connection (sanity — fix does not break legitimate access)', async () => {
    const result = await CalendarConnectionService.reconnect(ORG_B, CONN_B_ID);
    assert.equal(result.organizationId, ORG_B);
  });

  it('syncCalendars(): org B CAN sync its own connection (sanity)', async () => {
    const calIds = await CalendarConnectionService.syncCalendars(ORG_B, CONN_B_ID);
    assert.deepEqual(calIds, ['local']); // ManualProvider's static calendar list
  });
});
