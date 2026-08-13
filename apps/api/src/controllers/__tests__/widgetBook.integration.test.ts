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
 * Both rejection paths must leave zero Lead/Appointment/Conversation state.
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
      customerName: 'Jamie Rivera',
      phone:        '555-030-1111',
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

  it('succeeds for a session in a qualifying stage (book_appointment in that stage\'s allowedTools)', async () => {
    const slug = 'book-qualifying-stage';
    const { orgId, widgetSessionId } = await seedOrgAndSession(slug);

    // Advance the session to a stage whose blueprint allows booking — same
    // data ConversationOrchestrationService would have produced from a real
    // conversation reaching this objective.
    await AIConversationSessionModel.findOneAndUpdate(
      { widgetSessionId, organizationId: orgId },
      { $set: { currentObjective: 'offer_appointment', workflowState: 'booking_in_progress' } },
    );

    const { status, body } = await postJson(
      `/api/v1/widget/${slug}/book`,
      bookingPayload({ widgetSessionId }),
    );

    assert.equal(status, 201);
    assert.equal(body.status, 'ok');
    assert.ok(body.data.appointmentId);
    assert.ok(body.data.confirmationNumber);

    const counts = await countRecords(orgId);
    assert.equal(counts.leads, 1);
    assert.equal(counts.appointments, 1);

    // memory.bookingStatus should now be 'booked' — required for the
    // duplicate-prevention guard to have anything to check on a next attempt.
    const session = await AIConversationSessionModel.findOne({ widgetSessionId, organizationId: orgId }).lean();
    assert.equal((session!.memory as any).bookingStatus, 'booked');
  });

  it('blocks a duplicate booking on the same session via guardBookAppointment (regression: guard behavior unchanged)', async () => {
    const slug = 'book-duplicate';
    const { orgId, widgetSessionId } = await seedOrgAndSession(slug);

    await AIConversationSessionModel.findOneAndUpdate(
      { widgetSessionId, organizationId: orgId },
      { $set: { currentObjective: 'offer_appointment', workflowState: 'booking_in_progress' } },
    );

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
