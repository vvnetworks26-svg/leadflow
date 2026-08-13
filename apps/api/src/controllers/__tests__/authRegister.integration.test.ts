/**
 * authRegister.integration.test.ts
 *
 * Integration test for POST /api/v1/auth/register against a real
 * (in-memory) MongoDB instance — covers making phone a required signup
 * field, threaded through AuthService.register() -> OrganizationService
 * .create() -> seedDefaults(), so a new org's Business document passes
 * BusinessIdentityFactory validation (Layer 3 live) from the very first
 * conversation instead of being silently degraded.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { createApp } from '../../app';
import { UserModel } from '../../models/User.model';
import { closeConversationSummaryQueue } from '../../ai/pipeline/ConversationSummaryQueue';
import { OrganizationModel } from '../../models/Organization.model';
import { BusinessModel } from '../../models/Business.model';
import { BusinessIdentityService } from '../../business-identity/BusinessIdentityService';

describe('POST /api/v1/auth/register — phone required, Layer 3 live from signup', () => {
  let mongod: MongoMemoryServer;
  let server: Server;
  let baseUrl: string;

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    const app = createApp();
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    // Defensive/consistency with the other integration test files that boot
    // the real app — registration itself never triggers a conversation-
    // summary job, so this is a safe no-op here, but keeps teardown uniform.
    await closeConversationSummaryQueue();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await mongoose.disconnect();
    await mongod.stop();
  });

  async function postJson(path: string, body: unknown): Promise<{ status: number; body: any }> {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  }

  it('valid phone: registration succeeds, the seeded Business document has that exact phone, and BusinessIdentityFactory validation passes immediately', async () => {
    const { status, body } = await postJson('/api/v1/auth/register', {
      firstName: 'Jordan',
      lastName:  'Rivera',
      email:     'jordan.rivera@example.com',
      password:  'correct-horse-battery-staple',
      phone:     '555-010-9999',
    });

    assert.equal(status, 201);
    assert.equal(body.status, 'ok');
    const orgId = body.data.organizationId;
    assert.ok(orgId);

    // The seeded Business document has the real phone, not the empty default.
    const biz = await BusinessModel.findOne({ organizationId: orgId }).lean();
    assert.ok(biz, 'Business document should exist immediately after registration (awaited seed, not fire-and-forget)');
    assert.equal(biz!.phone, '555-010-9999');

    // Layer 3 is live: BusinessIdentityService.load() must succeed, not
    // silently return null the way it does for the 5 pre-existing degraded
    // orgs (empty/missing phone).
    const identity = await BusinessIdentityService.load(orgId);
    assert.ok(identity, 'BusinessIdentityFactory validation must pass immediately for a freshly-registered org');
    assert.equal(identity!.contactInfo.phone, '555-010-9999');
  });

  it('missing phone: 422s and leaves no orphaned Organization or User record', async () => {
    const email = 'no-phone@example.com';
    const { status, body } = await postJson('/api/v1/auth/register', {
      firstName: 'No',
      lastName:  'Phone',
      email,
      password:  'correct-horse-battery-staple',
      // phone omitted
    });

    assert.equal(status, 422);
    assert.equal(body.status, 'error');
    assert.equal(body.code, 'VALIDATION_ERROR');
    assert.match(body.message, /phone/i);

    const user = await UserModel.findOne({ email });
    assert.equal(user, null, 'no User document should exist — validation runs before any creation');
    const orgCountByName = await OrganizationModel.countDocuments({ name: /No Phone/i });
    assert.equal(orgCountByName, 0, 'no Organization document should exist');
  });

  it('malformed phone (too short): 422s and leaves no orphaned Organization or User record', async () => {
    const email = 'bad-phone@example.com';
    const { status, body } = await postJson('/api/v1/auth/register', {
      firstName: 'Bad',
      lastName:  'Phone',
      email,
      password:  'correct-horse-battery-staple',
      phone:     '123',
    });

    assert.equal(status, 422);
    assert.equal(body.code, 'VALIDATION_ERROR');
    assert.match(body.message, /phone/i);

    const user = await UserModel.findOne({ email });
    assert.equal(user, null, 'no User document should exist for a malformed-phone registration attempt');
    const orgCountByName = await OrganizationModel.countDocuments({ name: /Bad Phone/i });
    assert.equal(orgCountByName, 0, 'no Organization document should exist');
  });
});
