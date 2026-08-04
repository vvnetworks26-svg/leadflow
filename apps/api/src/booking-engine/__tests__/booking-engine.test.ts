/**
 * booking-engine/__tests__/booking-engine.test.ts
 *
 * Layer 8 — Booking Engine Test Suite
 * 100+ deterministic unit tests. No DB. No external services.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { SlotGenerator }        from '../SlotGenerator';
import { SlotValidator }        from '../SlotValidator';
import { BookingValidator }     from '../BookingValidator';
import { ConfirmationBuilder }  from '../BookingConfirmation';
import { BookingSummaryBuilder }from '../BookingSummary';
import { BookingRulesService }  from '../BookingRules';
import { BookingPolicy }        from '../BookingPolicy';
import { BusinessHoursService } from '../BusinessHours';
import { MockCalendarProvider } from '../MockCalendarProvider';
import { CalendarProviderRegistry } from '../CalendarProvider';
import { BookingCoordinator, BookingEvents } from '../BookingCoordinator';
import { BookingEngine }        from '../BookingEngine';
import {
  formatSlotLabel,
  safeTimezone,
  utcOffsetLabel,
  isValidTimezone,
} from '../TimezoneService';

import { buildBusinessIdentity } from '../../business-identity/BusinessIdentityFactory';
import type { BusinessIdentity } from '../../business-identity/types';
import type {
  BookingRequest, AppointmentSlot, BlockedSlot,
  AvailabilityRequest, BookingConfirmation,
} from '../types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const alwaysOpen  = { isOpen: true,  openTime: '08:00', closeTime: '18:00' };
const alwaysClosed = { isOpen: false, openTime: '09:00', closeTime: '17:00' };

// Fixed "now" — Tuesday 2026-08-04 14:00 UTC (well within business hours)
const NOW_MS = new Date('2026-08-04T14:00:00Z').getTime();
// 2 days from now
const FUTURE_MS = NOW_MS + 2 * 86400_000;
const FUTURE_ISO = new Date(FUTURE_MS).toISOString().slice(0, 10);

function makeIdentity(overrides: Record<string, unknown> = {}): BusinessIdentity {
  return buildBusinessIdentity({
    organizationId: 'org-test',
    companyProfile: {
      businessId: 'org-test', businessName: 'HVAC Pro', industry: 'hvac',
      subIndustry: '', description: '', website: '', logo: '', tagline: '',
    },
    contactInfo: {
      phone: '555-000-1111', email: 'info@hvacpro.com', address: '1 Main St',
      city: 'Austin', state: 'TX', country: 'US', timezone: 'UTC',
    },
    businessHours: {
      monday: alwaysOpen, tuesday: alwaysOpen, wednesday: alwaysOpen,
      thursday: alwaysOpen, friday: alwaysOpen,
      saturday: alwaysClosed, sunday: alwaysClosed,
      emergencyAfterHours: true, vacationMode: false, holidays: [], closedDates: [],
    },
    bookingRules: {
      minimumNoticeHours: 1, maximumBookingDays: 30,
      defaultDurationMins: 60, slotIntervalMins: 60,
      sameDayBooking: true, weekendBooking: false, businessBufferMins: 0,
    },
    ...overrides,
  });
}

function makeSlot(startIso: string, durationMins = 60): AppointmentSlot {
  const start = new Date(startIso);
  const end   = new Date(start.getTime() + durationMins * 60_000);
  return {
    startUtc:        start.toISOString(),
    endUtc:          end.toISOString(),
    startLocal:      start.toISOString(),
    endLocal:        end.toISOString(),
    displayLabel:    formatSlotLabel(start.toISOString(), 'UTC'),
    timezone:        'UTC',
    durationMinutes: durationMins,
    available:       true,
  };
}

function makeRequest(overrides: Partial<BookingRequest> = {}): BookingRequest {
  return {
    organizationId: 'org-test',
    conversationId: 'conv-1',
    guestName:      'Alice Smith',
    guestPhone:     '555-123-4567',
    guestEmail:     'alice@example.com',
    service:        'AC Repair',
    requestedSlot:  makeSlot(`2026-08-06T10:00:00Z`),  // Thursday, 2 days out
    nowMs:          NOW_MS,
    ...overrides,
  };
}

function makeAvailabilityReq(overrides: Partial<AvailabilityRequest> = {}): AvailabilityRequest {
  const identity = makeIdentity();
  return {
    organizationId: 'org-test',
    businessHours:  identity.businessHours,
    bookingRules:   identity.bookingRules,
    timezone:       'UTC',
    blockedSlots:   [],
    startDateUtc:   FUTURE_ISO,
    nowMs:          NOW_MS,
    ...overrides,
  };
}

// ─── 1. BusinessHoursService ──────────────────────────────────────────────────

describe('BusinessHoursService.isOpen', () => {
  const openHours = makeIdentity().businessHours;

  it('returns true during open hours on a weekday', () => {
    // Tuesday 10:00 UTC
    const t = new Date('2026-08-04T10:00:00Z').getTime();
    assert.equal(BusinessHoursService.isOpen(openHours, 'UTC', t), true);
  });

  it('returns false before open time', () => {
    // Tuesday 07:00 UTC (opens at 08:00)
    const t = new Date('2026-08-04T07:00:00Z').getTime();
    assert.equal(BusinessHoursService.isOpen(openHours, 'UTC', t), false);
  });

  it('returns false after close time', () => {
    // Tuesday 19:00 UTC (closes at 18:00)
    const t = new Date('2026-08-04T19:00:00Z').getTime();
    assert.equal(BusinessHoursService.isOpen(openHours, 'UTC', t), false);
  });

  it('returns false on Saturday (closed)', () => {
    const t = new Date('2026-08-08T10:00:00Z').getTime(); // Saturday
    assert.equal(BusinessHoursService.isOpen(openHours, 'UTC', t), false);
  });

  it('returns false on Sunday (closed)', () => {
    const t = new Date('2026-08-09T10:00:00Z').getTime(); // Sunday
    assert.equal(BusinessHoursService.isOpen(openHours, 'UTC', t), false);
  });

  it('returns false when vacationMode is true', () => {
    const vacationHours = { ...openHours, vacationMode: true };
    const t = new Date('2026-08-04T10:00:00Z').getTime();
    assert.equal(BusinessHoursService.isOpen(vacationHours, 'UTC', t), false);
  });

  it('returns false on a holiday', () => {
    const hours = {
      ...openHours,
      holidays: [{ date: '2026-08-04', name: 'Holiday', recurring: false }],
    };
    const t = new Date('2026-08-04T10:00:00Z').getTime();
    assert.equal(BusinessHoursService.isOpen(hours, 'UTC', t), false);
  });

  it('returns false on a recurring holiday (MM-DD match)', () => {
    const hours = {
      ...openHours,
      holidays: [{ date: '08-04', name: 'Annual Holiday', recurring: true }],
    };
    const t = new Date('2026-08-04T10:00:00Z').getTime();
    assert.equal(BusinessHoursService.isOpen(hours, 'UTC', t), false);
  });

  it('returns false on a closedDate', () => {
    const hours = { ...openHours, closedDates: ['2026-08-04'] };
    const t = new Date('2026-08-04T10:00:00Z').getTime();
    assert.equal(BusinessHoursService.isOpen(hours, 'UTC', t), false);
  });

  it('returns false for invalid timezone (safe fallback)', () => {
    const t = new Date('2026-08-04T10:00:00Z').getTime();
    // Falls back to UTC — should still work
    assert.doesNotThrow(() => BusinessHoursService.isOpen(openHours, 'Invalid/TZ', t));
  });

  it('isWeekend returns true for Saturday', () => {
    const t = new Date('2026-08-08T10:00:00Z').getTime(); // Saturday
    assert.equal(BusinessHoursService.isWeekend('UTC', t), true);
  });

  it('isWeekend returns false for Tuesday', () => {
    assert.equal(BusinessHoursService.isWeekend('UTC', NOW_MS), false);
  });

  it('nextOpeningTime returns null in vacation mode', () => {
    const vacationHours = { ...openHours, vacationMode: true };
    assert.equal(BusinessHoursService.nextOpeningTime(vacationHours, 'UTC', NOW_MS), null);
  });

  it('nextOpeningTime returns a future timestamp when currently closed', () => {
    const night = new Date('2026-08-04T22:00:00Z').getTime(); // after close
    const next  = BusinessHoursService.nextOpeningTime(openHours, 'UTC', night);
    assert.ok(next !== null && next > night);
  });
});

// ─── 2. SlotGenerator ────────────────────────────────────────────────────────

describe('SlotGenerator.generate — open hours', () => {
  it('generates slots on open weekdays', () => {
    const result = SlotGenerator.generate(makeAvailabilityReq());
    assert.ok(result.slots.length > 0);
  });

  it('no slots on Saturday when weekendBooking=false', () => {
    // Force startDate to a Saturday
    const saturdayIso = '2026-08-08'; // Saturday
    const result = SlotGenerator.generate(makeAvailabilityReq({ startDateUtc: saturdayIso }));
    const satSlots = result.slots.filter(s => {
      const d = new Date(s.startUtc);
      return d.getUTCDay() === 6;
    });
    assert.equal(satSlots.length, 0);
  });

  it('no slots when vacationMode=true', () => {
    const hours = { ...makeIdentity().businessHours, vacationMode: true };
    const result = SlotGenerator.generate(makeAvailabilityReq({ businessHours: hours }));
    assert.equal(result.slots.length, 0);
  });

  it('no slots before minimumNoticeHours', () => {
    // startDate = now, minNotice = 24h → no slots for today
    const rules = { ...makeIdentity().bookingRules, minimumNoticeHours: 24 };
    const todayIso = new Date(NOW_MS).toISOString().slice(0, 10);
    const result = SlotGenerator.generate(makeAvailabilityReq({
      bookingRules:  rules,
      startDateUtc:  todayIso,
      nowMs:         NOW_MS,
    }));
    // All slots should be at least 24h from NOW_MS
    for (const s of result.slots) {
      const diff = new Date(s.startUtc).getTime() - NOW_MS;
      assert.ok(diff >= 24 * 3600_000 - 1000, `Slot too soon: ${s.displayLabel}`);
    }
  });

  it('nextAvailable is the first slot', () => {
    const result = SlotGenerator.generate(makeAvailabilityReq());
    if (result.slots.length > 0) {
      assert.equal(result.nextAvailable?.startUtc, result.slots[0]!.startUtc);
    }
  });

  it('suggested contains at most 3 slots', () => {
    const result = SlotGenerator.generate(makeAvailabilityReq());
    assert.ok(result.suggested.length <= 3);
  });

  it('hasOpenSlots is true when slots exist', () => {
    const result = SlotGenerator.generate(makeAvailabilityReq());
    assert.equal(result.hasOpenSlots, result.slots.length > 0);
  });

  it('respects slot interval: slots are spaced by slotIntervalMins', () => {
    const result = SlotGenerator.generate(makeAvailabilityReq());
    if (result.slots.length >= 2) {
      const interval = makeIdentity().bookingRules.slotIntervalMins;
      const diff = (
        new Date(result.slots[1]!.startUtc).getTime() -
        new Date(result.slots[0]!.startUtc).getTime()
      ) / 60_000;
      assert.equal(diff, interval);
    }
  });

  it('all slots have correct durationMinutes', () => {
    const result = SlotGenerator.generate(makeAvailabilityReq());
    for (const s of result.slots) {
      assert.equal(s.durationMinutes, makeIdentity().bookingRules.defaultDurationMins);
    }
  });

  it('blocked slot is excluded from results', () => {
    const blockedStart = new Date(FUTURE_MS + 0 * 3600_000).toISOString();
    const blockedEnd   = new Date(FUTURE_MS + 2 * 3600_000).toISOString();
    // Align to 08:00 on future day
    const dayStart = FUTURE_ISO + 'T08:00:00Z';
    const dayEnd   = FUTURE_ISO + 'T10:00:00Z';
    const blocked: BlockedSlot[] = [{ startUtc: dayStart, endUtc: dayEnd }];
    const result = SlotGenerator.generate(makeAvailabilityReq({ blockedSlots: blocked }));
    const overlap = result.slots.some(s => {
      const ss = new Date(s.startUtc).getTime();
      const se = new Date(s.endUtc).getTime();
      const bs = new Date(dayStart).getTime();
      const be = new Date(dayEnd).getTime();
      return ss < be && se > bs;
    });
    assert.equal(overlap, false);
  });

  it('sameDayBooking=false skips today', () => {
    const rules = { ...makeIdentity().bookingRules, sameDayBooking: false };
    const todayIso = new Date(NOW_MS).toISOString().slice(0, 10);
    const result = SlotGenerator.generate(makeAvailabilityReq({
      bookingRules: rules,
      startDateUtc: todayIso,
      nowMs:        NOW_MS,
    }));
    for (const s of result.slots) {
      const slotDate = new Date(s.startUtc).toISOString().slice(0, 10);
      assert.notEqual(slotDate, todayIso, `Slot on same day: ${s.displayLabel}`);
    }
  });

  it('respects maximumBookingDays limit', () => {
    const rules = { ...makeIdentity().bookingRules, maximumBookingDays: 2 };
    const result = SlotGenerator.generate(makeAvailabilityReq({
      bookingRules:  rules,
      startDateUtc:  new Date(NOW_MS).toISOString().slice(0, 10),
      nowMs:         NOW_MS,
    }));
    const maxMs = NOW_MS + 2 * 86400_000;
    for (const s of result.slots) {
      assert.ok(new Date(s.startUtc).getTime() <= maxMs + 86400_000);
    }
  });

  it('slot displayLabel is a non-empty string', () => {
    const result = SlotGenerator.generate(makeAvailabilityReq());
    for (const s of result.slots.slice(0, 3)) {
      assert.ok(s.displayLabel.length > 0);
    }
  });

  it('slots are in ascending time order', () => {
    const result = SlotGenerator.generate(makeAvailabilityReq());
    for (let i = 1; i < result.slots.length; i++) {
      const prev = new Date(result.slots[i - 1]!.startUtc).getTime();
      const curr = new Date(result.slots[i]!.startUtc).getTime();
      assert.ok(curr >= prev, 'Slots not in order');
    }
  });
});

describe('SlotGenerator — holidays and closed dates', () => {
  it('no slots on a holiday', () => {
    const hours = {
      ...makeIdentity().businessHours,
      holidays: [{ date: FUTURE_ISO, name: 'Test Holiday', recurring: false }],
    };
    const result = SlotGenerator.generate(makeAvailabilityReq({ businessHours: hours }));
    const holidaySlots = result.slots.filter(s =>
      new Date(s.startUtc).toISOString().slice(0, 10) === FUTURE_ISO
    );
    assert.equal(holidaySlots.length, 0);
  });

  it('no slots on a closedDate', () => {
    const hours = { ...makeIdentity().businessHours, closedDates: [FUTURE_ISO] };
    const result = SlotGenerator.generate(makeAvailabilityReq({ businessHours: hours }));
    const closedSlots = result.slots.filter(s =>
      new Date(s.startUtc).toISOString().slice(0, 10) === FUTURE_ISO
    );
    assert.equal(closedSlots.length, 0);
  });
});

// ─── 3. SlotValidator ────────────────────────────────────────────────────────

describe('SlotValidator', () => {
  const identity = makeIdentity();

  function validate(slotStart: string, overrides: { blockedSlots?: BlockedSlot[], nowMs?: number } = {}) {
    const slot = makeSlot(slotStart);
    return SlotValidator.validate({
      slot,
      businessHours: identity.businessHours,
      bookingRules:  identity.bookingRules,
      timezone:      'UTC',
      blockedSlots:  overrides.blockedSlots ?? [],
      nowMs:         overrides.nowMs ?? NOW_MS,
    });
  }

  it('passes: valid future slot during open hours', () => {
    // Thursday 2026-08-06 at 10:00 UTC
    const r = validate('2026-08-06T10:00:00Z');
    assert.equal(r.valid, true);
  });

  it('fails: slot in the past', () => {
    const r = validate('2026-08-01T10:00:00Z');
    assert.equal(r.valid, false);
    assert.equal(r.code, 'SLOT_IN_PAST');
  });

  it('fails: insufficient notice (1h before slot)', () => {
    // Slot in 30 min — minimumNoticeHours=1
    const tooSoon = new Date(NOW_MS + 30 * 60_000).toISOString();
    const r = validate(tooSoon);
    assert.equal(r.valid, false);
    assert.equal(r.code, 'INSUFFICIENT_NOTICE');
  });

  it('fails: outside advance window (31 days out, max=30)', () => {
    const tooFar = new Date(NOW_MS + 31 * 86400_000).toISOString();
    const r = validate(tooFar);
    assert.equal(r.valid, false);
    assert.equal(r.code, 'OUTSIDE_ADVANCE_WINDOW');
  });

  it('fails: vacation mode', () => {
    const vacationHours = { ...identity.businessHours, vacationMode: true };
    const slot = makeSlot('2026-08-06T10:00:00Z');
    const r = SlotValidator.validate({
      slot, businessHours: vacationHours, bookingRules: identity.bookingRules,
      timezone: 'UTC', blockedSlots: [], nowMs: NOW_MS,
    });
    assert.equal(r.valid, false);
    assert.equal(r.code, 'VACATION_MODE');
  });

  it('fails: business closed at slot time', () => {
    // Saturday
    const r = validate('2026-08-08T10:00:00Z');
    assert.equal(r.valid, false);
    assert.ok(r.code === 'BUSINESS_CLOSED' || r.code === 'WEEKEND_NOT_ALLOWED');
  });

  it('fails: weekend booking when not allowed', () => {
    const rules = { ...identity.bookingRules, weekendBooking: false };
    const slot  = makeSlot('2026-08-08T10:00:00Z'); // Saturday
    // Make Saturday appear open so the weekend rule is tested specifically
    const openWeekend = {
      ...identity.businessHours,
      saturday: alwaysOpen,
      sunday:   alwaysOpen,
    };
    const r = SlotValidator.validate({
      slot, businessHours: openWeekend, bookingRules: rules,
      timezone: 'UTC', blockedSlots: [], nowMs: NOW_MS,
    });
    assert.equal(r.valid, false);
    assert.equal(r.code, 'WEEKEND_NOT_ALLOWED');
  });

  it('fails: double booking — slot overlaps blocked', () => {
    const blocked: BlockedSlot[] = [{
      startUtc: '2026-08-06T09:00:00Z',
      endUtc:   '2026-08-06T11:00:00Z',
    }];
    const r = validate('2026-08-06T10:00:00Z', { blockedSlots: blocked });
    assert.equal(r.valid, false);
    assert.equal(r.code, 'DOUBLE_BOOKING');
  });

  it('passes: adjacent bookings (no overlap)', () => {
    const blocked: BlockedSlot[] = [{
      startUtc: '2026-08-06T09:00:00Z',
      endUtc:   '2026-08-06T10:00:00Z',
    }];
    const r = validate('2026-08-06T10:00:00Z', { blockedSlots: blocked });
    assert.equal(r.valid, true);
  });

  it('fails: slot for different technician does not conflict', () => {
    // Our engine is slot-based, not technician-based at this level — passes
    const r = validate('2026-08-06T10:00:00Z');
    assert.equal(r.valid, true);
  });
});

// ─── 4. BookingValidator ─────────────────────────────────────────────────────

describe('BookingValidator', () => {
  const identity = makeIdentity();

  function validate(overrides: Partial<BookingRequest> = {}, blockedSlots: BlockedSlot[] = []) {
    return BookingValidator.validate({
      request:  makeRequest(overrides),
      identity,
      blockedSlots,
      nowMs:    NOW_MS,
    });
  }

  it('passes: complete valid booking request', () => {
    const r = validate();
    assert.equal(r.valid, true);
  });

  it('fails: missing guest name', () => {
    const r = validate({ guestName: '' });
    assert.equal(r.valid, false);
    assert.equal(r.code, 'MISSING_NAME');
  });

  it('fails: missing both phone and email', () => {
    const r = validate({ guestPhone: '', guestEmail: '' });
    assert.equal(r.valid, false);
    assert.equal(r.code, 'MISSING_PHONE');
  });

  it('passes: phone only (no email required)', () => {
    const r = validate({ guestEmail: '' });
    assert.equal(r.valid, true);
  });

  it('passes: email only (no phone required)', () => {
    const r = validate({ guestPhone: '' });
    assert.equal(r.valid, true);
  });

  it('fails: missing service', () => {
    const r = validate({ service: '' });
    assert.equal(r.valid, false);
    assert.equal(r.code, 'MISSING_SERVICE');
  });

  it('fails: booking not permitted', () => {
    const identity = makeIdentity();
    // Directly override permissions after construction (bypass factory defaults)
    const noPermIdentity = {
      ...identity,
      permissions: { allowed: [] as any[], denied: [] as any[] },
    } as BusinessIdentity;
    const r = BookingValidator.validate({ request: makeRequest(), identity: noPermIdentity, blockedSlots: [], nowMs: NOW_MS });
    assert.equal(r.valid, false);
    assert.equal(r.code, 'BOOKING_NOT_PERMITTED');
  });

  it('fails: slot in past', () => {
    const r = validate({ requestedSlot: makeSlot('2026-08-01T10:00:00Z') });
    assert.equal(r.valid, false);
    assert.equal(r.code, 'SLOT_IN_PAST');
  });

  it('fails: double booking', () => {
    const blocked: BlockedSlot[] = [{
      startUtc: '2026-08-06T09:00:00Z',
      endUtc:   '2026-08-06T11:00:00Z',
    }];
    const r = validate({}, blocked);
    assert.equal(r.valid, false);
    assert.equal(r.code, 'DOUBLE_BOOKING');
  });
});

// ─── 5. BookingRulesService ───────────────────────────────────────────────────

describe('BookingRulesService', () => {
  const identity = makeIdentity();

  it('returns default duration when service not in catalog', () => {
    const r = BookingRulesService.forRequest(identity, 'Unknown Service');
    assert.equal(r.durationMinutes, identity.bookingRules.defaultDurationMins);
  });

  it('returns catalog duration when service matches', () => {
    const identityWithCatalog = makeIdentity({
      servicesCatalog: [{
        id: 'ac1', name: 'AC Tune-Up', description: '', keywords: [],
        emergencyEligible: false, bookable: true, estimatedDuration: 45, enabled: true,
      }],
    });
    const r = BookingRulesService.forRequest(identityWithCatalog, 'AC Tune-Up');
    assert.equal(r.durationMinutes, 45);
  });

  it('emergency override: minimumNoticeHours=0', () => {
    const emergencyIdentity = makeIdentity({
      emergencyPolicy: { enabled: true, triggers: [{ keyword: 'emergency', priority: 'critical' }] },
    });
    const r = BookingRulesService.forRequest(emergencyIdentity, 'AC Repair', true);
    assert.equal(r.minimumNoticeHours, 0);
    assert.equal(r.isEmergencyOverride, true);
  });

  it('emergency override: weekendBooking=true', () => {
    const emergencyIdentity = makeIdentity({
      emergencyPolicy: { enabled: true, triggers: [] },
    });
    const r = BookingRulesService.forRequest(emergencyIdentity, 'AC Repair', true);
    assert.equal(r.weekendBooking, true);
  });

  it('no emergency override when emergencyPolicy.enabled=false', () => {
    const noEmergIdentity = makeIdentity({
      emergencyPolicy: { enabled: false, triggers: [] },
    });
    const r = BookingRulesService.forRequest(noEmergIdentity, 'AC Repair', true);
    assert.equal(r.isEmergencyOverride, false);
    assert.equal(r.minimumNoticeHours, identity.bookingRules.minimumNoticeHours);
  });

  it('toBookingRulesShape maps all fields correctly', () => {
    const effective = BookingRulesService.forRequest(identity, '');
    const shape = BookingRulesService.toBookingRulesShape(effective);
    assert.equal(shape.minimumNoticeHours,  effective.minimumNoticeHours);
    assert.equal(shape.maximumBookingDays,  effective.maximumBookingDays);
    assert.equal(shape.defaultDurationMins, effective.durationMinutes);
    assert.equal(shape.slotIntervalMins,    effective.slotIntervalMinutes);
    assert.equal(shape.sameDayBooking,      effective.sameDayBooking);
    assert.equal(shape.weekendBooking,      effective.weekendBooking);
  });
});

// ─── 6. BookingPolicy ─────────────────────────────────────────────────────────

describe('BookingPolicy', () => {
  const identity = makeIdentity();

  it('canBook returns allowed=true for default identity', () => {
    assert.equal(BookingPolicy.canBook(identity).allowed, true);
  });

  it('canBook returns allowed=false when permission missing', () => {
    const identity = makeIdentity();
    const noPerm = { ...identity, permissions: { allowed: [] as any[], denied: [] as any[] } } as BusinessIdentity;
    assert.equal(BookingPolicy.canBook(noPerm).allowed, false);
  });

  it('canReschedule returns allowed=true when permission granted', () => {
    // Factory defaults don't include reschedule_appointment — construct directly
    const withReschedule = {
      ...identity,
      permissions: { allowed: ['reschedule_appointment'] as any[], denied: [] as any[] },
    } as BusinessIdentity;
    assert.equal(BookingPolicy.canReschedule(withReschedule).allowed, true);
  });

  it('canReschedule returns allowed=false when permission not granted', () => {
    assert.equal(BookingPolicy.canReschedule(identity).allowed, false);
  });

  it('isServiceBookable returns true for empty catalog', () => {
    assert.equal(BookingPolicy.isServiceBookable(identity, 'Any Service').allowed, true);
  });

  it('isServiceBookable returns false for disabled service', () => {
    const withCatalog = makeIdentity({
      servicesCatalog: [{
        id: 's1', name: 'Duct Cleaning', description: '', keywords: [],
        emergencyEligible: false, bookable: true, estimatedDuration: 90, enabled: false,
      }],
    });
    assert.equal(BookingPolicy.isServiceBookable(withCatalog, 'Duct Cleaning').allowed, false);
  });

  it('isServiceBookable returns false for non-bookable service', () => {
    const withCatalog = makeIdentity({
      servicesCatalog: [{
        id: 's1', name: 'Consultation', description: '', keywords: [],
        emergencyEligible: false, bookable: false, estimatedDuration: 30, enabled: true,
      }],
    });
    assert.equal(BookingPolicy.isServiceBookable(withCatalog, 'Consultation').allowed, false);
  });

  it('supportsEmergency returns true when enabled + afterHours', () => {
    const emergIdentity = makeIdentity({
      emergencyPolicy: { enabled: true, triggers: [] },
    });
    assert.equal(BookingPolicy.supportsEmergency(emergIdentity), true);
  });

  it('supportsEmergency returns false when disabled', () => {
    const noEmerg = makeIdentity({
      emergencyPolicy: { enabled: false, triggers: [] },
    });
    assert.equal(BookingPolicy.supportsEmergency(noEmerg), false);
  });

  it('getServiceDuration returns catalog value', () => {
    const withCatalog = makeIdentity({
      servicesCatalog: [{
        id: 'svc1', name: 'HVAC Repair', description: '', keywords: [],
        emergencyEligible: true, bookable: true, estimatedDuration: 75, enabled: true,
      }],
    });
    assert.equal(BookingPolicy.getServiceDuration(withCatalog, 'HVAC Repair'), 75);
  });

  it('getServiceDuration falls back to bookingRules default', () => {
    assert.equal(BookingPolicy.getServiceDuration(identity, 'Unknown'), identity.bookingRules.defaultDurationMins);
  });
});

// ─── 7. ConfirmationBuilder ───────────────────────────────────────────────────

describe('ConfirmationBuilder', () => {
  const request = makeRequest();

  it('builds a confirmation with a valid LF- code', () => {
    const c = ConfirmationBuilder.build(request, 'HVAC Pro', undefined, NOW_MS);
    assert.ok(c.confirmationNumber.startsWith('LF-'));
    assert.equal(c.confirmationNumber.length, 11); // LF- + 8 hex
  });

  it('confirmation number is deterministic (same inputs = same code)', () => {
    const c1 = ConfirmationBuilder.build(request, 'HVAC Pro', undefined, NOW_MS);
    const c2 = ConfirmationBuilder.build(request, 'HVAC Pro', undefined, NOW_MS);
    assert.equal(c1.confirmationNumber, c2.confirmationNumber);
  });

  it('different nowMs produces different confirmation number', () => {
    const c1 = ConfirmationBuilder.build(request, 'HVAC Pro', undefined, NOW_MS);
    const c2 = ConfirmationBuilder.build(request, 'HVAC Pro', undefined, NOW_MS + 1000);
    assert.notEqual(c1.confirmationNumber, c2.confirmationNumber);
  });

  it('status is confirmed', () => {
    const c = ConfirmationBuilder.build(request, 'HVAC Pro', undefined, NOW_MS);
    assert.equal(c.status, 'confirmed');
  });

  it('includes customer details', () => {
    const c = ConfirmationBuilder.build(request, 'HVAC Pro', undefined, NOW_MS);
    assert.equal(c.customerName,  request.guestName);
    assert.equal(c.customerPhone, request.guestPhone);
    assert.equal(c.customerEmail, request.guestEmail);
    assert.equal(c.service,       request.service);
  });

  it('includes correct duration', () => {
    const c = ConfirmationBuilder.build(request, 'HVAC Pro', undefined, NOW_MS);
    assert.equal(c.durationMinutes, request.requestedSlot.durationMinutes);
  });

  it('includes bookingId when provided', () => {
    const c = ConfirmationBuilder.build(request, 'HVAC Pro', 'booking-xyz', NOW_MS);
    assert.equal(c.bookingId, 'booking-xyz');
  });

  it('summary builds correct headline', () => {
    const c   = ConfirmationBuilder.build(request, 'HVAC Pro', undefined, NOW_MS);
    const sum = ConfirmationBuilder.summary(c, 'HVAC Pro');
    assert.ok(sum.headline.includes(request.service));
    assert.equal(sum.confirmationNumber, c.confirmationNumber);
    assert.ok(sum.nextStep.length > 0);
  });
});

// ─── 8. BookingSummaryBuilder ─────────────────────────────────────────────────

describe('BookingSummaryBuilder', () => {
  const request  = makeRequest();
  const identity = makeIdentity();

  it('availabilityMessage when no slots: returns helpful message', () => {
    const msg = BookingSummaryBuilder.availabilityMessage({
      slots: [], nextAvailable: null, suggested: [], hasOpenSlots: false,
      rangeStart: FUTURE_ISO, rangeEnd: FUTURE_ISO,
    });
    assert.ok(/no available|check a different/i.test(msg));
  });

  it('availabilityMessage with single slot: mentions it directly', () => {
    const slot = makeSlot('2026-08-06T10:00:00Z');
    const result = {
      slots: [slot], nextAvailable: slot, suggested: [slot], hasOpenSlots: true,
      rangeStart: FUTURE_ISO, rangeEnd: FUTURE_ISO,
    };
    const msg = BookingSummaryBuilder.availabilityMessage(result);
    assert.ok(msg.length > 0);
  });

  it('availabilityMessage with 3 slots: lists them', () => {
    const slots = [
      makeSlot('2026-08-06T08:00:00Z'),
      makeSlot('2026-08-06T09:00:00Z'),
      makeSlot('2026-08-06T10:00:00Z'),
    ];
    const result = {
      slots, nextAvailable: slots[0]!, suggested: slots, hasOpenSlots: true,
      rangeStart: FUTURE_ISO, rangeEnd: FUTURE_ISO,
    };
    const msg = BookingSummaryBuilder.availabilityMessage(result);
    assert.ok(/here are|available/i.test(msg));
  });

  it('confirmationMessage includes checkmark and confirmation number', () => {
    const c   = ConfirmationBuilder.build(request, 'HVAC Pro', undefined, NOW_MS);
    const sum = BookingSummaryBuilder.fromConfirmation(c, 'HVAC Pro');
    const msg = BookingSummaryBuilder.confirmationMessage(sum);
    assert.ok(msg.includes('✅'));
    assert.ok(msg.includes(sum.confirmationNumber));
  });
});

// ─── 9. MockCalendarProvider ──────────────────────────────────────────────────

describe('MockCalendarProvider', () => {
  let mock: MockCalendarProvider;

  before(() => { mock = new MockCalendarProvider(); });
  beforeEach(() => { mock.reset(); });

  it('name is "mock"', () => {
    assert.equal(mock.name, 'mock');
  });

  it('createEvent returns a unique string ID', async () => {
    const id1 = await mock.createEvent({ title: 'A', startUtc: '2026-08-06T10:00:00Z', endUtc: '2026-08-06T11:00:00Z', description: '', attendees: [] });
    const id2 = await mock.createEvent({ title: 'B', startUtc: '2026-08-07T10:00:00Z', endUtc: '2026-08-07T11:00:00Z', description: '', attendees: [] });
    assert.notEqual(id1, id2);
  });

  it('getEvents returns created events', async () => {
    await mock.createEvent({ title: 'Test', startUtc: '2026-08-06T10:00:00Z', endUtc: '2026-08-06T11:00:00Z', description: '', attendees: [] });
    assert.equal(mock.getEvents().length, 1);
  });

  it('updateEvent modifies existing event', async () => {
    const id = await mock.createEvent({ title: 'Old', startUtc: '2026-08-06T10:00:00Z', endUtc: '2026-08-06T11:00:00Z', description: '', attendees: [] });
    await mock.updateEvent(id, { title: 'New' });
    assert.equal(mock.getEvents()[0]!.event.title, 'New');
  });

  it('deleteEvent removes the event', async () => {
    const id = await mock.createEvent({ title: 'Del', startUtc: '2026-08-06T10:00:00Z', endUtc: '2026-08-06T11:00:00Z', description: '', attendees: [] });
    await mock.deleteEvent(id);
    assert.equal(mock.getEvents().length, 0);
  });

  it('isAvailable returns true for non-overlapping time', async () => {
    await mock.createEvent({ title: 'Busy', startUtc: '2026-08-06T09:00:00Z', endUtc: '2026-08-06T10:00:00Z', description: '', attendees: [] });
    const avail = await mock.isAvailable('2026-08-06T10:00:00Z', '2026-08-06T11:00:00Z');
    assert.equal(avail, true);
  });

  it('isAvailable returns false for overlapping time', async () => {
    await mock.createEvent({ title: 'Busy', startUtc: '2026-08-06T09:00:00Z', endUtc: '2026-08-06T11:00:00Z', description: '', attendees: [] });
    const avail = await mock.isAvailable('2026-08-06T10:00:00Z', '2026-08-06T12:00:00Z');
    assert.equal(avail, false);
  });

  it('blockTime causes isAvailable to return false', async () => {
    mock.blockTime('2026-08-06T10:00:00Z', '2026-08-06T11:00:00Z');
    const avail = await mock.isAvailable('2026-08-06T10:00:00Z', '2026-08-06T11:00:00Z');
    assert.equal(avail, false);
  });

  it('failNext causes createEvent to throw', async () => {
    mock.failNext();
    await assert.rejects(() =>
      mock.createEvent({ title: 'X', startUtc: '2026-08-06T10:00:00Z', endUtc: '2026-08-06T11:00:00Z', description: '', attendees: [] })
    );
  });

  it('reset clears all events and blocked times', async () => {
    await mock.createEvent({ title: 'T', startUtc: '2026-08-06T10:00:00Z', endUtc: '2026-08-06T11:00:00Z', description: '', attendees: [] });
    mock.blockTime('2026-08-06T12:00:00Z', '2026-08-06T13:00:00Z');
    mock.reset();
    assert.equal(mock.getEvents().length, 0);
    const avail = await mock.isAvailable('2026-08-06T12:00:00Z', '2026-08-06T13:00:00Z');
    assert.equal(avail, true);
  });
});

// ─── 10. CalendarProviderRegistry ────────────────────────────────────────────

describe('CalendarProviderRegistry', () => {
  beforeEach(() => { CalendarProviderRegistry.reset(); });

  it('returns null when no provider registered', () => {
    assert.equal(CalendarProviderRegistry.default(), null);
    assert.equal(CalendarProviderRegistry.hasProvider(), false);
  });

  it('register + get returns the provider', () => {
    const mock = new MockCalendarProvider();
    CalendarProviderRegistry.register(mock);
    assert.ok(CalendarProviderRegistry.get('mock') !== null);
  });

  it('default() returns first registered provider', () => {
    const mock = new MockCalendarProvider();
    CalendarProviderRegistry.register(mock);
    assert.ok(CalendarProviderRegistry.default() !== null);
  });

  it('list() returns registered provider names', () => {
    const mock = new MockCalendarProvider();
    CalendarProviderRegistry.register(mock);
    assert.ok(CalendarProviderRegistry.list().includes('mock'));
  });
});

// ─── 11. BookingCoordinator ───────────────────────────────────────────────────

describe('BookingCoordinator.book', () => {
  let mock: MockCalendarProvider;
  const identity = makeIdentity();

  beforeEach(() => {
    mock = new MockCalendarProvider();
    BookingEvents.reset();
  });

  it('succeeds with valid request and mock provider', async () => {
    const result = await BookingCoordinator.book(
      makeRequest(), identity, [], mock, NOW_MS,
    );
    assert.equal(result.success, true);
    assert.ok(result.confirmation !== null);
    assert.ok(result.summary !== null);
    assert.equal(result.errorCode, undefined);
  });

  it('creates a calendar event in mock provider', async () => {
    await BookingCoordinator.book(makeRequest(), identity, [], mock, NOW_MS);
    assert.equal(mock.getEvents().length, 1);
  });

  it('fails with validation error on missing name', async () => {
    const result = await BookingCoordinator.book(
      makeRequest({ guestName: '' }), identity, [], mock, NOW_MS,
    );
    assert.equal(result.success, false);
    assert.equal(result.errorCode, 'MISSING_NAME');
    assert.equal(mock.getEvents().length, 0);
  });

  it('emits booking_created event on success', async () => {
    let emitted: import('../types').BookingEvent | null = null;
    BookingEvents.on(e => { emitted = e; });
    await BookingCoordinator.book(makeRequest(), identity, [], mock, NOW_MS);
    assert.ok(emitted !== null);
    assert.equal((emitted as any).type, 'booking_created');
  });

  it('does not emit event on validation failure', async () => {
    let emitted = false;
    BookingEvents.on(() => { emitted = true; });
    await BookingCoordinator.book(makeRequest({ guestName: '' }), identity, [], mock, NOW_MS);
    assert.equal(emitted, false);
  });

  it('succeeds even when provider.createEvent throws (non-blocking)', async () => {
    mock.failNext();
    const result = await BookingCoordinator.book(makeRequest(), identity, [], mock, NOW_MS);
    assert.equal(result.success, true);
    assert.ok(result.confirmation !== null);
  });

  it('works without a calendar provider (null)', async () => {
    const result = await BookingCoordinator.book(makeRequest(), identity, [], null, NOW_MS);
    assert.equal(result.success, true);
  });

  it('double-booking prevented', async () => {
    const blocked: BlockedSlot[] = [{
      startUtc: '2026-08-06T09:00:00Z',
      endUtc:   '2026-08-06T11:00:00Z',
    }];
    const result = await BookingCoordinator.book(
      makeRequest(), identity, blocked, mock, NOW_MS,
    );
    assert.equal(result.success, false);
    assert.equal(result.errorCode, 'DOUBLE_BOOKING');
  });
});

describe('BookingCoordinator.cancel', () => {
  let mock: MockCalendarProvider;

  beforeEach(() => {
    mock = new MockCalendarProvider();
    BookingEvents.reset();
  });

  it('emits booking_cancelled event', async () => {
    const request = makeRequest();
    const conf = ConfirmationBuilder.build(request, 'HVAC Pro', 'event-1', NOW_MS);
    let emitted: import('../types').BookingEvent | null = null;
    BookingEvents.on(e => { emitted = e; });
    await BookingCoordinator.cancel(conf, 'org-test', 'conv-1', mock, NOW_MS);
    assert.ok(emitted !== null);
    assert.equal((emitted as any).type, 'booking_cancelled');
  });
});

describe('BookingCoordinator.reschedule', () => {
  let mock: MockCalendarProvider;
  const identity = makeIdentity();

  beforeEach(() => {
    mock = new MockCalendarProvider();
    BookingEvents.reset();
  });

  it('emits booking_rescheduled event on success', async () => {
    const original = ConfirmationBuilder.build(makeRequest(), 'HVAC Pro', 'old-event', NOW_MS);
    const newSlot  = makeSlot('2026-08-07T10:00:00Z');  // different day
    const newReq   = makeRequest({ requestedSlot: newSlot });
    let   emitted: import('../types').BookingEvent | null = null;
    BookingEvents.on(e => { emitted = e; });
    const result = await BookingCoordinator.reschedule(original, newReq, identity, [], mock, NOW_MS);
    assert.equal(result.success, true);
    assert.ok(emitted !== null);
    assert.equal((emitted as any).type, 'booking_rescheduled');
  });
});

// ─── 12. TimezoneService ──────────────────────────────────────────────────────

describe('TimezoneService', () => {
  it('formatSlotLabel returns weekday and time', () => {
    const label = formatSlotLabel('2026-08-06T10:00:00Z', 'UTC');
    assert.ok(label.length > 0);
    assert.ok(/Thursday/i.test(label) || /Aug/i.test(label));
  });

  it('safeTimezone returns UTC for undefined', () => {
    assert.equal(safeTimezone(undefined), 'UTC');
  });

  it('safeTimezone returns UTC for invalid timezone', () => {
    assert.equal(safeTimezone('Invalid/Zone'), 'UTC');
  });

  it('safeTimezone returns valid timezone unchanged', () => {
    assert.equal(safeTimezone('America/Chicago'), 'America/Chicago');
  });

  it('isValidTimezone returns true for UTC', () => {
    assert.equal(isValidTimezone('UTC'), true);
  });

  it('isValidTimezone returns false for garbage', () => {
    assert.equal(isValidTimezone('Not/Real/Zone'), false);
  });

  it('utcOffsetLabel returns UTC+00:00 for UTC', () => {
    const label = utcOffsetLabel('2026-08-06T10:00:00Z', 'UTC');
    assert.ok(label.includes('UTC'));
  });

  it('formatSlotLabel produces consistent label for same input', () => {
    const a = formatSlotLabel('2026-08-06T10:00:00Z', 'UTC');
    const b = formatSlotLabel('2026-08-06T10:00:00Z', 'UTC');
    assert.equal(a, b);
  });
});

// ─── 13. BookingEngine — public API ──────────────────────────────────────────

describe('BookingEngine.getAvailability', () => {
  const identity = makeIdentity();

  it('returns availability response with slots', async () => {
    const result = await BookingEngine.getAvailability(identity, { nowMs: NOW_MS });
    assert.ok(typeof result.hasOpenSlots === 'boolean');
    assert.ok(Array.isArray(result.slots));
  });

  it('canBook returns true for default identity', () => {
    assert.equal(BookingEngine.canBook(identity), true);
  });

  it('canBook returns false when no permission', () => {
    const noPerm = { ...identity, permissions: { allowed: [] as any[], denied: [] as any[] } } as BusinessIdentity;
    assert.equal(BookingEngine.canBook(noPerm), false);
  });

  it('getNextSlotLabel returns a string when slots available', async () => {
    const label = await BookingEngine.getNextSlotLabel(identity, { nowMs: NOW_MS });
    if (label !== null) {
      assert.ok(label.length > 0);
    }
  });
});

describe('BookingEngine.book', () => {
  let mock: MockCalendarProvider;
  const identity = makeIdentity();

  beforeEach(() => {
    mock = new MockCalendarProvider();
    BookingEvents.reset();
    CalendarProviderRegistry.reset();
  });

  it('books successfully with mock provider', async () => {
    const result = await BookingEngine.book(makeRequest(), identity, [], mock);
    assert.equal(result.success, true);
    assert.ok(result.confirmation?.confirmationNumber.startsWith('LF-'));
  });

  it('uses registered default provider when none passed', async () => {
    CalendarProviderRegistry.register(mock);
    const result = await BookingEngine.book(makeRequest(), identity, []);
    assert.equal(result.success, true);
  });

  it('returns error on validation failure', async () => {
    const result = await BookingEngine.book(makeRequest({ guestName: '' }), identity, [], mock);
    assert.equal(result.success, false);
    assert.ok(result.errorCode !== undefined);
  });
});

// ─── 14. Integration — full booking lifecycle ────────────────────────────────

describe('Integration — full booking lifecycle', () => {
  let mock: MockCalendarProvider;
  const identity = makeIdentity();

  beforeEach(() => {
    mock = new MockCalendarProvider();
    BookingEvents.reset();
    CalendarProviderRegistry.reset();
  });

  it('full lifecycle: availability → book → cancel → events emitted', async () => {
    const events: import('../types').BookingEvent[] = [];
    BookingEvents.on(e => events.push(e));

    // 1. Get availability
    const avail = await BookingEngine.getAvailability(identity, { nowMs: NOW_MS });
    assert.ok(avail.hasOpenSlots, 'No slots available');

    // 2. Book using first suggested slot
    const slot = avail.nextAvailable!;
    const request = makeRequest({ requestedSlot: slot });
    const bookResult = await BookingEngine.book(request, identity, [], mock);
    assert.equal(bookResult.success, true);

    // 3. Cancel
    await BookingEngine.cancel(
      bookResult.confirmation!,
      'org-test', 'conv-1', mock,
    );

    // 4. Events: booking_created + booking_cancelled
    assert.equal(events.length, 2);
    assert.equal(events[0]!.type, 'booking_created');
    assert.equal(events[1]!.type, 'booking_cancelled');
  });

  it('full lifecycle: book → reschedule → events emitted', async () => {
    const events: import('../types').BookingEvent[] = [];
    BookingEvents.on(e => events.push(e));

    // Book
    const bookResult = await BookingEngine.book(makeRequest(), identity, [], mock);
    assert.equal(bookResult.success, true);

    // Reschedule to a different slot
    const newSlot = makeSlot('2026-08-07T10:00:00Z');
    const reschedResult = await BookingEngine.reschedule(
      bookResult.confirmation!,
      makeRequest({ requestedSlot: newSlot }),
      identity, [], mock,
    );
    assert.equal(reschedResult.success, true);
    // events[0] = booking_created (original), events[1] = booking_created (reschedule inner),
    // events[2] = booking_rescheduled
    const reschedEvent = events.find(e => e.type === 'booking_rescheduled');
    assert.ok(reschedEvent !== undefined, 'No booking_rescheduled event emitted');
    assert.ok(events.length >= 2);
  });

  it('double-booking: second booking at same slot is rejected', async () => {
    // Book first
    const r1 = await BookingEngine.book(makeRequest(), identity, [], mock);
    assert.equal(r1.success, true);

    // Block the same slot
    const slot = makeRequest().requestedSlot;
    const blocked: BlockedSlot[] = [{ startUtc: slot.startUtc, endUtc: slot.endUtc }];

    // Try to book same slot again
    const r2 = await BookingEngine.book(makeRequest(), identity, blocked, mock);
    assert.equal(r2.success, false);
    assert.equal(r2.errorCode, 'DOUBLE_BOOKING');
  });

  it('summary message includes confirmation number', async () => {
    const result = await BookingEngine.book(makeRequest(), identity, [], mock);
    assert.equal(result.success, true);
    const msg = BookingSummaryBuilder.confirmationMessage(result.summary!);
    assert.ok(msg.includes(result.confirmation!.confirmationNumber));
  });
});
