/**
 * widgetPhoneCollectedLead.integration.test.ts
 *
 * Integration coverage for phone-collected lead capture (ai/orchestrator.ts
 * step 3b): a real Lead must be created the moment a phone number is
 * collected mid-conversation, independent of whether booking ever
 * completes — not just when widgetBook() eventually runs.
 *
 * Mirrors widgetChat.integration.test.ts's harness (mocked Gemini, real
 * in-memory MongoDB via mongodb-memory-server) since the trigger lives
 * inside POST /api/v1/widget/:token/chat's real orchestration path.
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

function fakeGeminiClient(replyText: string): GoogleGenerativeAI {
  return {
    getGenerativeModel: () => ({
      startChat: () => ({
        sendMessage: async () => ({
          response: { text: () => replyText, usageMetadata: { totalTokenCount: 42 } },
        }),
      }),
      generateContent: async () => ({ response: { text: () => replyText } }),
    }),
  } as unknown as GoogleGenerativeAI;
}

describe('Widget chat — phone-collected lead capture', () => {
  let mongod: MongoMemoryServer;
  let server: Server;
  let baseUrl: string;

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    setGeminiClient(fakeGeminiClient('[mocked Gemini reply]'));

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

  async function seedOrgAndSession(slug: string): Promise<{ orgId: string; widgetSessionId: string }> {
    const org = await OrganizationModel.create({ name: `Org ${slug}`, slug, industry: 'HVAC', status: 'active' });
    await BusinessModel.create({ organizationId: org.id, companyName: `Org ${slug}`, phone: '555-010-2000' });

    const { body } = await postJson(`/api/v1/widget/${slug}/session`, {});
    return { orgId: org.id as string, widgetSessionId: body.data.widgetSessionId };
  }

  /**
   * Puts the session at the exact stage the trigger requires: previous-turn
   * objective is 'collect_phone' (or 'handle_emergency'), matching what a
   * real conversation would have produced by the time the visitor is asked
   * for their number — see the six blueprint declarations of create_lead
   * in conversation-engine/blueprints/default-blueprints.ts.
   */
  async function advanceToPhoneCollectionStage(orgId: string, widgetSessionId: string, objective = 'collect_phone') {
    await AIConversationSessionModel.findOneAndUpdate(
      { widgetSessionId, organizationId: orgId },
      { $set: { currentObjective: objective, workflowState: 'discovery' } },
    );
  }

  it('phone collected, conversation abandoned: a real Lead is created, scoped to this conversation', async () => {
    const slug = 'phone-lead-abandoned';
    const { orgId, widgetSessionId } = await seedOrgAndSession(slug);
    await advanceToPhoneCollectionStage(orgId, widgetSessionId);

    const { status } = await postJson(
      `/api/v1/widget/${slug}/chat`,
      { message: "It's 555-030-1111, that's the best number.", widgetSessionId },
    );
    assert.equal(status, 200);
    await new Promise(r => setTimeout(r, 300));

    const session = await AIConversationSessionModel.findOne({ widgetSessionId, organizationId: orgId }).lean();
    assert.equal((session!.memory as any).phone, '5550301111', 'sanity: memory actually captured the phone this turn');

    const lead = await LeadModel.findOne({ organizationId: orgId, conversationId: session!.conversationId }).lean();
    assert.ok(lead, 'a Lead should be auto-captured the moment phone is collected, with no booking ever attempted');
    assert.equal(lead!.phone, '5550301111');
    assert.equal(lead!.status, 'New', 'unqualified/new — must not read as a completed booking');
    assert.equal(lead!.appointmentId, undefined, 'no booking occurred — this Lead must not be conflated with an Appointment');
  });

  it('two phone-collection-shaped turns in one session (visitor repeats their number): still exactly one Lead', async () => {
    const slug = 'phone-lead-repeat';
    const { orgId, widgetSessionId } = await seedOrgAndSession(slug);
    await advanceToPhoneCollectionStage(orgId, widgetSessionId);

    await postJson(`/api/v1/widget/${slug}/chat`, { message: 'Call me at 555-030-1111.', widgetSessionId });

    // phoneCollected is now true in memory; the session's persisted
    // currentObjective has also advanced past collect_phone. Force it back
    // to simulate a race / the visitor restating their number while the
    // edge-trigger's own guard (phoneCollected can't revert to false) is
    // exactly what's under test here, backed by findByConversationId's
    // defense-in-depth in LeadService.
    await advanceToPhoneCollectionStage(orgId, widgetSessionId);
    await postJson(`/api/v1/widget/${slug}/chat`, { message: 'Again, it is 555-030-1111.', widgetSessionId });
    await new Promise(r => setTimeout(r, 300));

    const session = await AIConversationSessionModel.findOne({ widgetSessionId, organizationId: orgId }).lean();
    const count = await LeadModel.countDocuments({ organizationId: orgId, conversationId: session!.conversationId });
    assert.equal(count, 1, 'a repeated phone-collection-shaped turn must not create a second Lead');
  });

  it("different org's session: the Lead is scoped to the right organizationId, never leaking to another org", async () => {
    const slugA = 'phone-lead-org-a';
    const slugB = 'phone-lead-org-b';
    const { orgId: orgIdA, widgetSessionId: sessionA } = await seedOrgAndSession(slugA);
    const { orgId: orgIdB } = await seedOrgAndSession(slugB);
    await advanceToPhoneCollectionStage(orgIdA, sessionA);

    await postJson(`/api/v1/widget/${slugA}/chat`, { message: 'Reach me at 555-030-1111.', widgetSessionId: sessionA });
    await new Promise(r => setTimeout(r, 300));

    const session = await AIConversationSessionModel.findOne({ widgetSessionId: sessionA, organizationId: orgIdA }).lean();
    const leadInOwnOrg   = await LeadModel.findOne({ organizationId: orgIdA, conversationId: session!.conversationId }).lean();
    const leadInOtherOrg = await LeadModel.findOne({ organizationId: orgIdB, conversationId: session!.conversationId }).lean();

    assert.ok(leadInOwnOrg, 'lead should exist under the originating organization');
    assert.equal(leadInOtherOrg, null, 'the same conversationId must never resolve to a Lead under a different organization');
  });

  it('does NOT auto-capture a lead when phone appears outside a lead-capture objective stage', async () => {
    const slug = 'phone-lead-wrong-stage';
    const { orgId, widgetSessionId } = await seedOrgAndSession(slug);
    // Deliberately leave currentObjective at a non-lead-capture stage.
    await AIConversationSessionModel.findOneAndUpdate(
      { widgetSessionId, organizationId: orgId },
      { $set: { currentObjective: 'answer_question', workflowState: 'discovery' } },
    );

    await postJson(`/api/v1/widget/${slug}/chat`, { message: 'By the way it is 555-030-1111.', widgetSessionId });

    const session = await AIConversationSessionModel.findOne({ widgetSessionId, organizationId: orgId }).lean();
    const count = await LeadModel.countDocuments({ organizationId: orgId, conversationId: session!.conversationId });
    assert.equal(count, 0, 'phone appearing outside collect_phone/handle_emergency must not auto-create a Lead');
  });
});
