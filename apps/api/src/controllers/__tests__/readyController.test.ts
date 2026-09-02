/**
 * readyController.test.ts
 *
 * Proves GET /api/v1/ready actually FAILS its status code when Mongo is
 * disconnected — the whole point of adding it. The pre-existing
 * GET /api/v1/health always returns 200 and reports database state only in its
 * body, so Render could never use it as a health check: an instance with a dead
 * connection still looked healthy and kept receiving traffic.
 *
 * Connection state is faked by stubbing mongoose.connection.readyState — the
 * single value config/database.ts's isDatabaseConnected() reads. Stubbing that
 * rather than mocking isDatabaseConnected() away means the REAL predicate runs,
 * so this also covers the controller actually being wired to it. No live Mongo
 * is required; this runs in CI unchanged.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import { getReady } from '../readyController';
import { getHealth } from '../healthController';

/** mongoose readyState: 0 = disconnected, 1 = connected. */
function setReadyState(state: 0 | 1): void {
  Object.defineProperty(mongoose.connection, 'readyState', {
    value: state, configurable: true, writable: true,
  });
}

/** Minimal Express res double capturing status + JSON payload. */
function makeReqRes() {
  const req = {} as any;
  let statusCode: number | undefined;
  let payload: any;
  const res = {
    status(code: number) { statusCode = code; return this; },
    json(body: unknown) { payload = body; return this; },
  } as any;
  return { req, res, getStatus: () => statusCode, getPayload: () => payload };
}

describe('readyController.getReady()', () => {

  afterEach(() => {
    // Hand readyState back to mongoose so a stub can't leak into other suites.
    delete (mongoose.connection as any).readyState;
  });

  it('returns 200 and ready:true when the database is connected', () => {
    setReadyState(1);

    const { req, res, getStatus, getPayload } = makeReqRes();
    getReady(req, res);

    assert.equal(getStatus(), 200);
    assert.equal(getPayload().ready, true);
    assert.equal(getPayload().database, 'connected');
  });

  it('returns 503 and ready:false when the database is NOT connected', () => {
    setReadyState(0);

    const { req, res, getStatus, getPayload } = makeReqRes();
    getReady(req, res);

    // The STATUS CODE — not just the body — must signal failure, otherwise
    // Render's health check keeps a broken instance in rotation. This is
    // exactly what GET /api/v1/health fails to do.
    assert.equal(getStatus(), 503);
    assert.equal(getPayload().ready, false);
    assert.equal(getPayload().database, 'disconnected');
  });

  it('returns the documented response shape with an ISO-8601 timestamp', () => {
    setReadyState(1);

    const { req, res, getPayload } = makeReqRes();
    getReady(req, res);

    const body = getPayload();
    assert.deepEqual(
      Object.keys(body).sort(),
      ['database', 'ready', 'timestamp'],
      'response shape must stay { ready, database, timestamp }',
    );
    assert.equal(typeof body.timestamp, 'string');
    assert.ok(!Number.isNaN(Date.parse(body.timestamp)), 'timestamp must be parseable');
    assert.equal(body.timestamp, new Date(body.timestamp).toISOString(), 'timestamp must be ISO-8601 UTC');
  });

  it('leaves GET /api/v1/health untouched — it still always returns 200', () => {
    // Regression guard for the explicit instruction not to change the existing
    // health endpoint: something may already depend on its always-200 shape.
    setReadyState(0);

    const { req, res, getStatus, getPayload } = makeReqRes();
    getHealth(req, res);

    assert.equal(getStatus(), 200, '/health must still return 200 even when the DB is down');
    assert.equal(getPayload().database, 'disconnected');
  });
});
