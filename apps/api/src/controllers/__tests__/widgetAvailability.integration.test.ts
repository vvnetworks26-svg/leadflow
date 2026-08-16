/**
 * widgetAvailability.integration.test.ts
 *
 * Integration test for GET /api/v1/widget/:token/availability — the route
 * SlotPicker depends on (previously missing entirely; see widgetController.ts's
 * widgetGetAvailability()). Proves:
 *   - real, open slots come back for a properly configured business, reusing
 *     the booking-engine (Layer 8) slot generator — not a separate copy of
 *     the scheduling logic
 *   - an existing (non-canceled) appointment blocks its own slot but leaves
 *     the rest of the day open; a canceled appointment blocks nothing
 *   - an org with no Business document configured — the realistic
 *     "onboarding never finished" case — gets a clean, explicit rejection,
 *     never a 500 crash (BusinessIdentityService.load() returns null here:
 *     contactInfo.phone falls back to '' with no Business doc, which fails
 *     PhoneSchema's min(7) inside buildBusinessIdentity(), and that ZodError
 *     is caught and turned into null — see BusinessIdentityService.load()
 *     and MongoBusinessIdentityRepository.ts)
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
import { AppointmentModel } from '../../models/Appointment.model';

describe('GET /api/v1/widget/:token/availability', () => {
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
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await mongoose.disconnect();
    await mongod.stop();
  });

  async function getJson(path: string): Promise<{ status: number; body: any }> {
    const res = await fetch(`${baseUrl}${path}`);
    return { status: res.status, body: await res.json() };
  }

  const openDay = { isOpen: true, openTime: '09:00', closeTime: '17:00' };
  const closedDay = { isOpen: false, openTime: '09:00', closeTime: '17:00' };

  /** Organization + a fully configured Business — open Mon–Fri, closed weekends. */
  async function seedConfiguredOrg(slug: string): Promise<{ orgId: string }> {
    const org = await OrganizationModel.create({ name: `Org ${slug}`, slug, industry: 'HVAC', status: 'active' });
    await BusinessModel.create({
      organizationId: org.id,
      companyName:    `Org ${slug}`,
      phone:          '555-010-2000',
      businessHours: {
        monday: openDay, tuesday: openDay, wednesday: openDay, thursday: openDay, friday: openDay,
        saturday: closedDay, sunday: closedDay,
        emergencyAfterHours: true, vacationMode: false,
      },
    });
    return { orgId: org.id as string };
  }

  /** Organization only — no Business document at all (onboarding never finished). */
  async function seedOrgOnly(slug: string): Promise<{ orgId: string }> {
    const org = await OrganizationModel.create({ name: `Org ${slug}`, slug, industry: 'HVAC', status: 'active' });
    return { orgId: org.id as string };
  }

  it('returns real, open slots for a fully configured business', async () => {
    const slug = 'avail-baseline';
    await seedConfiguredOrg(slug);

    const { status, body } = await getJson(`/api/v1/widget/${slug}/availability?duration=60`);

    assert.equal(status, 200);
    assert.equal(body.status, 'ok');
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length > 0, 'expected at least one open slot');

    const slot = body.data[0];
    assert.equal(typeof slot.date, 'string');
    assert.equal(typeof slot.time, 'string');
    assert.equal(typeof slot.displayDate, 'string');
    assert.equal(typeof slot.displayTime, 'string');
    assert.equal(slot.available, true);

    // No slot should fall on a closed weekend day (Saturday=6, Sunday=0).
    for (const s of body.data) {
      const dow = new Date(`${s.date}T00:00:00Z`).getUTCDay();
      assert.notEqual(dow, 0, `unexpected Sunday slot: ${s.date} ${s.time}`);
      assert.notEqual(dow, 6, `unexpected Saturday slot: ${s.date} ${s.time}`);
    }
  });

  it('excludes a slot already covered by an existing (non-canceled) appointment, but leaves the rest of the day open', async () => {
    const slug = 'avail-excludes-booked';
    const { orgId } = await seedConfiguredOrg(slug);

    // First, see what's open so this test doesn't hardcode a date that
    // might fall outside the generated window.
    const before = await getJson(`/api/v1/widget/${slug}/availability?duration=60`);
    assert.ok(before.body.data.length > 1, 'need at least 2 open slots to prove partial blocking');
    const target = before.body.data[0];

    await AppointmentModel.create({
      organizationId: orgId,
      leadId:         'lead-1',
      leadName:       'Existing Customer',
      leadPhone:      '555-020-3000',
      date:           target.date,
      time:           target.time,
      duration:       60,
      type:           'Repair Consultation',
      status:         'Scheduled',
      confirmationNumber: 'LF-TESTBLK',
    });

    const after = await getJson(`/api/v1/widget/${slug}/availability?duration=60`);
    assert.equal(after.status, 200);

    const stillOffered = after.body.data.some((s: any) => s.date === target.date && s.time === target.time);
    assert.equal(stillOffered, false, 'the booked slot must not be offered again');
    assert.ok(after.body.data.length > 0, 'other slots on the same day/week must still be open');
    // Not asserting the response shrank: the endpoint caps to the nearest
    // MAX_WIDGET_SLOTS (see widgetGetAvailability) and backfills from later
    // slots as earlier ones are excluded, so the count can legitimately stay
    // the same size while its contents change — "the booked slot is gone"
    // (above) is the actual invariant this test is proving.
  });

  it('does not exclude a slot covered only by a Canceled appointment', async () => {
    const slug = 'avail-canceled-not-blocked';
    const { orgId } = await seedConfiguredOrg(slug);

    const before = await getJson(`/api/v1/widget/${slug}/availability?duration=60`);
    const target = before.body.data[0];

    await AppointmentModel.create({
      organizationId: orgId,
      leadId:         'lead-2',
      leadName:       'Canceled Customer',
      leadPhone:      '555-020-4000',
      date:           target.date,
      time:           target.time,
      duration:       60,
      type:           'Repair Consultation',
      status:         'Canceled',
      confirmationNumber: 'LF-TESTCXL',
    });

    const after = await getJson(`/api/v1/widget/${slug}/availability?duration=60`);
    const stillOffered = after.body.data.some((s: any) => s.date === target.date && s.time === target.time);
    assert.equal(stillOffered, true, 'a canceled appointment must not block its slot');
    assert.equal(after.body.data.length, before.body.data.length);
  });

  it('an org with no Business document configured gets a clean, explicit rejection — not a crash', async () => {
    const slug = 'avail-no-business';
    await seedOrgOnly(slug);

    const { status, body } = await getJson(`/api/v1/widget/${slug}/availability`);

    assert.equal(status, 404);
    assert.equal(body.status, 'error');
    assert.equal(body.code, 'ORG_IDENTITY_NOT_FOUND');
    assert.ok(body.message.length > 0);
  });

  it('an unresolvable widget token gets a clean 404, not a crash', async () => {
    const { status, body } = await getJson(`/api/v1/widget/totally-nonexistent-token/availability`);
    assert.equal(status, 404);
    assert.equal(body.status, 'error');
  });

  it('rejects an out-of-range duration with a validation error, not a crash', async () => {
    const slug = 'avail-bad-duration';
    await seedConfiguredOrg(slug);

    const { status, body } = await getJson(`/api/v1/widget/${slug}/availability?duration=5`);
    assert.equal(status, 422);
    assert.equal(body.code, 'VALIDATION_ERROR');
  });
});
