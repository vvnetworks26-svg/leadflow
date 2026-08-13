/**
 * widgetChat.integration.test.ts
 *
 * Integration test for POST /api/v1/widget/:token/chat against a real
 * (in-memory) MongoDB instance — covers the Layer 3 orchestration wiring
 * added to ai/orchestrator.ts plus the multi-tenant isolation guarantees
 * the widget flow depends on.
 *
 * Uses mongodb-memory-server so no external MongoDB/Docker is required.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import type { GoogleGenerativeAI } from '@google/generative-ai';

import { createApp } from '../../app';
import { OrganizationModel } from '../../models/Organization.model';
import { BusinessModel } from '../../models/Business.model';
import { AIConversationSessionModel } from '../../models/AIConversationSession.model';
import { setGeminiClient } from '../../ai/gemini';
import { closeConversationSummaryQueue } from '../../ai/pipeline/ConversationSummaryQueue';

/**
 * Fake Gemini client matching the shape ai/gemini.ts's sendToGemini() calls:
 *   client.getGenerativeModel({...}).startChat({history}).sendMessage(msg)
 *
 * Mirrors this repo's existing convention for testing external-API-backed
 * services via interface substitution (e.g. booking-engine's
 * MockCalendarProvider) rather than mocking at the network/HTTP layer —
 * no live Gemini call happens in this suite, keeping it fast, deterministic,
 * and free of external API cost/flakiness.
 */
function fakeGeminiClient(replyText: string): GoogleGenerativeAI {
  return {
    getGenerativeModel: () => ({
      startChat: () => ({
        sendMessage: async () => ({
          response: {
            text: () => replyText,
            usageMetadata: { totalTokenCount: 42 },
          },
        }),
      }),
      generateContent: async () => ({
        response: { text: () => replyText },
      }),
    }),
  } as unknown as GoogleGenerativeAI;
}

describe('Widget chat — end-to-end (Layer 3 orchestrator wiring)', () => {
  let mongod: MongoMemoryServer;
  let server: Server;
  let baseUrl: string;

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    // Default mock for this whole suite — a generic canned reply so tests
    // that don't care about exact wording stay deterministic. The dedicated
    // "real Gemini reply" test below overrides this per-call with a
    // distinguishing string to prove the actual Gemini branch (not the
    // rule-based fallback) is what gets persisted.
    setGeminiClient(fakeGeminiClient('[mocked Gemini reply]'));

    const app = createApp();
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    setGeminiClient(null);
    // Defensive: if any test here drove a conversation to 'completed'/
    // 'escalated', a conversation-summary job was enqueued (trigger a) and
    // opened a BullMQ Queue connection that must be closed for the process
    // to exit cleanly. Safe no-op if no job was ever enqueued.
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

  it('happy path: session + chat returns a real reply and persists tenant-scoped state', async () => {
    const org = await OrganizationModel.create({
      name: 'Acme HVAC', slug: 'acme-hvac-happy', industry: 'HVAC', status: 'active',
    });
    // phone must satisfy business-identity/schemas.ts's min(7) validation —
    // an empty/short phone silently degrades BusinessIdentityService.load()
    // to null, which would skip the Layer 3 orchestrator entirely.
    await BusinessModel.create({ organizationId: org.id, companyName: 'Acme HVAC', phone: '555-010-2000' });

    const { status: sessionStatus, body: sessionBody } = await postJson(
      `/api/v1/widget/acme-hvac-happy/session`, {},
    );
    assert.equal(sessionStatus, 201);
    const { widgetSessionId } = sessionBody.data;
    assert.match(widgetSessionId, /^[0-9a-f-]{36}$/i);

    const { status: chatStatus, body: chatBody } = await postJson(
      `/api/v1/widget/acme-hvac-happy/chat`,
      { message: 'My AC is broken, can you help?', widgetSessionId },
    );
    assert.equal(chatStatus, 200);
    assert.equal(chatBody.status, 'ok');
    assert.equal(typeof chatBody.data.reply, 'string');
    assert.ok(chatBody.data.reply.length > 0);

    // Persisted and correctly tenant-scoped
    const session = await AIConversationSessionModel
      .findOne({ widgetSessionId, organizationId: org.id })
      .lean();
    assert.ok(session, 'AIConversationSession should be persisted');
    assert.equal(session!.organizationId, org.id);
    assert.equal(session!.turnCount, 1);
    assert.ok(session!.history.length >= 2, 'history should contain the user + assistant turns');

    // Layer 3 orchestration state was actually produced and persisted —
    // proof the wired-in ConversationOrchestrationService ran, not just
    // the legacy planner.
    assert.ok(session!.currentObjective, 'orchestrate() should set a Layer 3 objective');
    assert.ok(session!.workflowState, 'orchestrate() should set a Layer 3 workflow state');
  });

  it('a successful Gemini call — not the rule-based fallback — is what gets persisted to the session', async () => {
    const DISTINCT_REPLY = '__GEMINI_SUCCESS_MARKER__ this text can only come from a real (mocked) Gemini call, never from buildFallbackReply()';

    const org = await OrganizationModel.create({
      name: 'Gemini Test Co', slug: 'gemini-success-marker', industry: 'HVAC', status: 'active',
    });
    await BusinessModel.create({ organizationId: org.id, companyName: 'Gemini Test Co', phone: '555-010-2000' });

    setGeminiClient(fakeGeminiClient(DISTINCT_REPLY));
    try {
      const { body: sessionBody } = await postJson(`/api/v1/widget/gemini-success-marker/session`, {});
      const { widgetSessionId } = sessionBody.data;

      const { status, body } = await postJson(
        `/api/v1/widget/gemini-success-marker/chat`,
        { message: 'My AC is broken, can you help?', widgetSessionId },
      );
      assert.equal(status, 200);
      assert.equal(body.data.reply, DISTINCT_REPLY, 'the API response must be the mocked Gemini text verbatim');

      const session = await AIConversationSessionModel
        .findOne({ widgetSessionId, organizationId: org.id })
        .lean();
      assert.ok(session, 'session should be persisted');
      const lastTurn = session!.history[session!.history.length - 1];
      assert.equal(lastTurn.role, 'assistant');
      assert.equal(lastTurn.content, DISTINCT_REPLY, 'the persisted history must contain the Gemini text, not fallback wording');
    } finally {
      // Restore the suite-wide default mock for subsequent tests.
      setGeminiClient(fakeGeminiClient('[mocked Gemini reply]'));
    }
  });

  it('cross-tenant isolation: a session created under org A is not reachable via org B\'s token', async () => {
    const orgA = await OrganizationModel.create({
      name: 'Org A', slug: 'org-a-isolation', industry: 'HVAC', status: 'active',
    });
    const orgB = await OrganizationModel.create({
      name: 'Org B', slug: 'org-b-isolation', industry: 'Plumbing', status: 'active',
    });

    const { body: sessionBody } = await postJson(`/api/v1/widget/org-a-isolation/session`, {});
    const { widgetSessionId } = sessionBody.data;

    // Sanity check: works for the real tenant.
    const { status: okStatus } = await postJson(
      `/api/v1/widget/org-a-isolation/chat`,
      { message: 'hello', widgetSessionId },
    );
    assert.equal(okStatus, 200);

    // Same widgetSessionId, but presented under org B's widget token.
    const { status: crossStatus, body: crossBody } = await postJson(
      `/api/v1/widget/org-b-isolation/chat`,
      { message: 'give me their data', widgetSessionId },
    );
    assert.equal(crossStatus, 404);
    assert.equal(crossBody.code, 'SESSION_NOT_FOUND');
    assert.equal(crossBody.status, 'error');

    // Confirm no document is ever readable under org B's id — the guarantee
    // the endpoint's 404 is actually backed by (not just a coincidental error).
    const leaked = await AIConversationSessionModel.findOne({
      widgetSessionId, organizationId: orgB.id,
    });
    assert.equal(leaked, null);

    // The real document only exists under org A.
    const real = await AIConversationSessionModel.findOne({
      widgetSessionId, organizationId: orgA.id,
    });
    assert.ok(real);
  });

  it('invalid widget token returns 404 with a clean error body, not a 500 or a leaked stack trace', async () => {
    const { status, body } = await postJson(
      `/api/v1/widget/totally-nonexistent-token/chat`,
      { message: 'hi', widgetSessionId: '00000000-0000-4000-8000-000000000000' },
    );
    assert.equal(status, 404);
    assert.equal(body.status, 'error');
    assert.equal(body.code, 'ORG_NOT_FOUND');
    assert.equal('stack' in body, false);
  });
});
