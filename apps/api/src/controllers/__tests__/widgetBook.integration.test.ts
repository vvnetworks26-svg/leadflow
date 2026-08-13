/**
 * widgetBook.integration.test.ts
 *
 * Integration test for POST /api/v1/widget/:token/book — proves the newly
 * wired-in enforcement actually gates the endpoint:
 *   - a session reference is now required
 *   - the Layer 3 stage gate (reusing ConversationOrchestrationService +
 *     default-blueprints.ts's allowedTools data) rejects premature bookings
 *   - ToolGuards (Layer 7) — specifically guardBookAppointment's duplicate
 *     prevention — is actually wired in and still behaves as before
 *   - customerName/phone are sourced from session.memory, never trusted
 *     verbatim from the client — a client-supplied customerName is only
 *     ever a fallback for the (rare, emergency-triage) case where the AI
 *     never captured one, and phone is never accepted from the client at
 *     all. A booking with no real contact info anywhere is rejected
 *     (MISSING_CONTACT_INFO), never persisted with placeholder data.
 * All rejection paths must leave zero Lead/Appointment/Conversation state.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { createApp } from '../../app';
import { OrganizationModel } from '../../models/Organization.model';
import { BusinessModel } from '../../models/Business.model';
import { AIConversationSessionModel } from '../../models/AIConversationSession.model';
import { LeadModel } from '../../models/Lead.model';
import { AppointmentModel } from '../../models/Appointment.model';
import { closeConversationSummaryQueue } from '../../ai/pipeline/ConversationSummaryQueue';

describe('POST /api/v1/widget/:token/book — enforcement', () => {
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
    // Successful bookings in this suite enqueue conversation-summary jobs
    // (trigger point c) — closing this queue's Redis connection is required
    // for the process to exit; an unclosed BullMQ Queue connection keeps
    // the event loop alive indefinitely.
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

  function bookingPayload(overrides: Record<string, unknown> = {}) {
    return {
      email:        'jamie@example.com',
      service:      'AC Repair',
      date:         '2026-09-01',
      time:         '10:00',
      ...overrides,
    };
  }

  async function countRecords(orgId: string) {
    return {
      leads:        await LeadModel.countDocuments({ organizationId: orgId }),
      appointments: await AppointmentModel.countDocuments({ organizationId: orgId }),
    };
  }

  /**
   * Advances a fresh session to a stage whose blueprint allows booking (same
   * data ConversationOrchestrationService would have produced from a real
   * conversation reaching this objective), and seeds session.memory —
   * widgetBook() now sources customerName/phone from there, not the request
   * body, so tests that bypass the real chat turns (as this suite does) must
   * seed it explicitly to simulate what a real conversation would have
   * already captured.
   */
  async function advanceToBookableStage(
    orgId: string,
    widgetSessionId: string,
    memory: { visitorName?: string | null; phone?: string | null } = {},
  ) {
    const set: Record<string, unknown> = {
      currentObjective: 'offer_appointment',
      workflowState:    'booking_in_progress',
    };
    if ('visitorName' in memory) set['memory.visitorName'] = memory.visitorName;
    if ('phone'       in memory) set['memory.phone']       = memory.phone;

    await AIConversationSessionModel.findOneAndUpdate(
      { widgetSessionId, organizationId: orgId },
      { $set: set },
    );
  }

  it('rejects a booking with no session reference — no records created', async () => {
    const slug = 'book-no-session';
    const { orgId } = await seedOrgAndSession(slug);

    const { status, body } = await postJson(`/api/v1/widget/${slug}/book`, bookingPayload());

    assert.equal(status, 422, 'missing widgetSessionId should 422 like any other required-field validation error');
    assert.equal(body.code, 'VALIDATION_ERROR');
    assert.match(body.message, /widgetSessionId/);

    const counts = await countRecords(orgId);
    assert.equal(counts.leads, 0);
    assert.equal(counts.appointments, 0);
  });

  it('rejects a booking with a session that has not reached a qualifying stage, with a distinguishable error — no records created', async () => {
    const slug = 'book-wrong-stage';
    const { orgId, widgetSessionId } = await seedOrgAndSession(slug);
    // Fresh session — currentObjective/workflowState/currentBlueprintId are
    // all still null (matches "immediately after session creation").

    const { status, body } = await postJson(
      `/api/v1/widget/${slug}/book`,
      bookingPayload({ widgetSessionId }),
    );

    assert.equal(status, 409);
    assert.equal(body.code, 'BOOKING_STAGE_NOT_REACHED');
    assert.notEqual(body.code, 'VALIDATION_ERROR', 'must be distinguishable from a validation error');

    const counts = await countRecords(orgId);
    assert.equal(counts.leads, 0);
    assert.equal(counts.appointments, 0);
  });

  it('succeeds for a session in a qualifying stage, persisting the real name/phone from session memory — not a client-supplied value', async () => {
    const slug = 'book-qualifying-stage';
    const { orgId, widgetSessionId } = await seedOrgAndSession(slug);

    // Real data the AI would have captured earlier in the conversation.
    await advanceToBookableStage(orgId, widgetSessionId, { visitorName: 'Jamie Rivera', phone: '555-030-1111' });

    // Client sends a different name — memory must win, proving the server
    // never trusts a client-supplied identity for a real booking.
    const { status, body } = await postJson(
      `/api/v1/widget/${slug}/book`,
      bookingPayload({ widgetSessionId, customerName: 'Someone Else' }),
    );

    assert.equal(status, 201);
    assert.equal(body.status, 'ok');
    assert.ok(body.data.appointmentId);
    assert.ok(body.data.confirmationNumber);
    assert.equal(body.data.customerName, 'Jamie Rivera', 'session memory must win over a client-supplied customerName');

    const counts = await countRecords(orgId);
    assert.equal(counts.leads, 1);
    assert.equal(counts.appointments, 1);

    const lead = await LeadModel.findOne({ organizationId: orgId }).lean();
    assert.equal(lead!.name,  'Jamie Rivera');
    assert.equal(lead!.phone, '555-030-1111');

    // memory.bookingStatus should now be 'booked' — required for the
    // duplicate-prevention guard to have anything to check on a next attempt.
    const session = await AIConversationSessionModel.findOne({ widgetSessionId, organizationId: orgId }).lean();
    assert.equal((session!.memory as any).bookingStatus, 'booked');
  });

  it('accepts a client-supplied customerName only as a fallback when session memory has no name (emergency-triage path — phone still comes from memory)', async () => {
    const slug = 'book-name-fallback';
    const { orgId, widgetSessionId } = await seedOrgAndSession(slug);

    // Phone collected (guaranteed by the stage gate), but no name — matches
    // the emergency-triage blueprints, which gate booking on phone alone.
    await advanceToBookableStage(orgId, widgetSessionId, { visitorName: null, phone: '555-030-1111' });

    const { status, body } = await postJson(
      `/api/v1/widget/${slug}/book`,
      bookingPayload({ widgetSessionId, customerName: 'Alex Chen' }),
    );

    assert.equal(status, 201);
    assert.equal(body.data.customerName, 'Alex Chen');

    const lead = await LeadModel.findOne({ organizationId: orgId }).lean();
    assert.equal(lead!.name,  'Alex Chen');
    assert.equal(lead!.phone, '555-030-1111', 'phone still comes from memory, never the client');
  });

  it('rejects a booking with neither session memory nor a client-supplied name available — no placeholder persisted, no records created', async () => {
    const slug = 'book-no-contact-info';
    const { orgId, widgetSessionId } = await seedOrgAndSession(slug);

    // Session reached a qualifying stage but memory never actually captured
    // a name or phone (unreachable via a real conversation — the stage gate
    // guarantees phoneCollected — but this suite advances stages directly,
    // so it can simulate the invariant being violated).
    await advanceToBookableStage(orgId, widgetSessionId, { visitorName: null, phone: null });

    const { status, body } = await postJson(
      `/api/v1/widget/${slug}/book`,
      bookingPayload({ widgetSessionId }),
    );

    assert.equal(status, 422);
    assert.equal(body.code, 'MISSING_CONTACT_INFO');
    assert.match(body.message, /name and phone/i);

    const counts = await countRecords(orgId);
    assert.equal(counts.leads, 0);
    assert.equal(counts.appointments, 0);
  });

  it('rejects a booking when memory has a name but genuinely no phone anywhere — no placeholder persisted', async () => {
    const slug = 'book-no-phone';
    const { orgId, widgetSessionId } = await seedOrgAndSession(slug);

    await advanceToBookableStage(orgId, widgetSessionId, { visitorName: 'Jamie Rivera', phone: null });

    const { status, body } = await postJson(
      `/api/v1/widget/${slug}/book`,
      bookingPayload({ widgetSessionId }),
    );

    assert.equal(status, 422);
    assert.equal(body.code, 'MISSING_CONTACT_INFO');

    const counts = await countRecords(orgId);
    assert.equal(counts.leads, 0);
    assert.equal(counts.appointments, 0);
  });

  it('blocks a duplicate booking on the same session via guardBookAppointment (regression: guard behavior unchanged)', async () => {
    const slug = 'book-duplicate';
    const { orgId, widgetSessionId } = await seedOrgAndSession(slug);

    await advanceToBookableStage(orgId, widgetSessionId, { visitorName: 'Jamie Rivera', phone: '555-030-1111' });

    const first = await postJson(`/api/v1/widget/${slug}/book`, bookingPayload({ widgetSessionId }));
    assert.equal(first.status, 201);

    const countsAfterFirst = await countRecords(orgId);
    assert.equal(countsAfterFirst.leads, 1);
    assert.equal(countsAfterFirst.appointments, 1);

    // Second booking attempt against the same now-booked session.
    const second = await postJson(
      `/api/v1/widget/${slug}/book`,
      bookingPayload({ widgetSessionId, date: '2026-09-02', time: '14:00' }),
    );

    assert.equal(second.status, 409);
    assert.equal(second.body.code, 'BOOKING_BLOCKED');
    assert.match(second.body.message, /already confirmed|duplicate/i);

    // No new Lead/Appointment from the blocked second attempt.
    const countsAfterSecond = await countRecords(orgId);
    assert.equal(countsAfterSecond.leads, 1);
    assert.equal(countsAfterSecond.appointments, 1);
  });
});
