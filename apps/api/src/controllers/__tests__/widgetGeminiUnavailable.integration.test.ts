/**
 * widgetGeminiUnavailable.integration.test.ts
 *
 * Integration coverage for the honest static Gemini-failure message
 * (ai/orchestrator.ts step 10): when Gemini throws, times out, or returns
 * an empty response, the customer must see a fixed, honest message with
 * the real business phone number — never the old scripted, stage-dependent
 * text from ai/fallback-reply.ts's buildFallbackReply(), which sometimes
 * claimed things ("will follow up shortly", "confirmed") that weren't true.
 *
 * Mirrors widgetChat.integration.test.ts's harness (real in-memory MongoDB
 * via mongodb-memory-server, Gemini client substituted at the transport
 * boundary) but the fake client here THROWS from sendMessage() to exercise
 * the real failure branch in ai/gemini.ts's sendToGemini(), rather than
 * returning a canned success reply.
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
import { LeadModel } from '../../models/Lead.model';
import { setGeminiClient } from '../../ai/gemini';
import { closeConversationSummaryQueue } from '../../ai/pipeline/ConversationSummaryQueue';

/**
 * A Gemini client whose sendMessage() always throws — sendToGemini()
 * (ai/gemini.ts) catches this and returns { success: false }, which is
 * exactly the branch under test.
 */
function throwingGeminiClient(): GoogleGenerativeAI {
  return {
    getGenerativeModel: () => ({
      startChat: () => ({
        sendMessage: async () => { throw new Error('simulated Gemini outage'); },
      }),
      generateContent: async () => { throw new Error('simulated Gemini outage'); },
    }),
  } as unknown as GoogleGenerativeAI;
}

describe('Widget chat — honest static message on Gemini failure', () => {
  let mongod: MongoMemoryServer;
  let server: Server;
  let baseUrl: string;

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    setGeminiClient(throwingGeminiClient());

    const app = createApp();
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    setGeminiClient(null);
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

  async function seedOrgAndSession(slug: string, phone: string): Promise<{ orgId: string; widgetSessionId: string }> {
    const org = await OrganizationModel.create({ name: `Org ${slug}`, slug, industry: 'HVAC', status: 'active' });
    await BusinessModel.create({ organizationId: org.id, companyName: `${slug} HVAC Co`, phone });

    const { body } = await postJson(`/api/v1/widget/${slug}/session`, {});
    return { orgId: org.id as string, widgetSessionId: body.data.widgetSessionId };
  }

  it('shows the honest static message with the real business phone number, not scripted fallback text', async () => {
    const { widgetSessionId } = await seedOrgAndSession('gemini-down-a', '555-777-0001');

    const { status, body } = await postJson(
      '/api/v1/widget/gemini-down-a/chat',
      { message: 'Hi, my AC is broken', widgetSessionId },
    );

    assert.equal(status, 200);
    assert.match(body.data.reply, /having trouble connecting/i);
    assert.match(body.data.reply, /555-777-0001/);
    // The old scripted fallback text this replaces — must never appear.
    assert.doesNotMatch(body.data.reply, /will follow up shortly/i);
    assert.doesNotMatch(body.data.reply, /is confirmed/i);
    assert.doesNotMatch(body.data.reply, /How can I help you today/i);
  });

  it('is tenant-scoped: a different org sees its own phone number, not a hardcoded one', async () => {
    const orgA = await seedOrgAndSession('gemini-down-tenant-a', '555-100-2000');
    const orgB = await seedOrgAndSession('gemini-down-tenant-b', '555-300-4000');

    const replyA = (await postJson('/api/v1/widget/gemini-down-tenant-a/chat',
      { message: 'hello', widgetSessionId: orgA.widgetSessionId })).body.data.reply;
    const replyB = (await postJson('/api/v1/widget/gemini-down-tenant-b/chat',
      { message: 'hello', widgetSessionId: orgB.widgetSessionId })).body.data.reply;

    assert.match(replyA, /555-100-2000/);
    assert.doesNotMatch(replyA, /555-300-4000/);
    assert.match(replyB, /555-300-4000/);
    assert.doesNotMatch(replyB, /555-100-2000/);
  });

  it('a phone already collected before a Gemini failure still gets a real Lead captured (PR #33 regression)', async () => {
    const slug = 'gemini-down-with-phone';
    const { orgId, widgetSessionId } = await seedOrgAndSession(slug, '555-900-1111');

    await AIConversationSessionModel.findOneAndUpdate(
      { widgetSessionId, organizationId: orgId },
      { $set: { currentObjective: 'collect_phone', workflowState: 'discovery' } },
    );

    const { status, body } = await postJson(
      `/api/v1/widget/${slug}/chat`,
      { message: "It's 555-030-1111, call me anytime.", widgetSessionId },
    );
    assert.equal(status, 200);
    // Gemini failed on this same turn — customer still gets the honest message.
    assert.match(body.data.reply, /having trouble connecting/i);
    await new Promise(r => setTimeout(r, 300));

    const session = await AIConversationSessionModel.findOne({ widgetSessionId, organizationId: orgId }).lean();
    const lead = await LeadModel.findOne({ organizationId: orgId, conversationId: session!.conversationId }).lean();
    assert.ok(lead, 'the phone-collected Lead trigger must fire regardless of the Gemini outcome on the same turn');
    assert.equal(lead!.phone, '5550301111');
  });

  it('repeated consecutive failures do not crash or loop — same honest message every time', async () => {
    const { widgetSessionId } = await seedOrgAndSession('gemini-down-repeat', '555-444-5555');

    for (let i = 0; i < 3; i++) {
      const { status, body } = await postJson(
        '/api/v1/widget/gemini-down-repeat/chat',
        { message: `attempt number ${i}`, widgetSessionId },
      );
      assert.equal(status, 200);
      assert.match(body.data.reply, /having trouble connecting/i);
      assert.match(body.data.reply, /555-444-5555/);
    }
  });
});
