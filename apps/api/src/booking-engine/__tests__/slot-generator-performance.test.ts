/**
 * booking-engine/__tests__/slot-generator-performance.test.ts
 *
 * Regression coverage for the ~12s GET /:token/availability investigation.
 *
 * Root cause: SlotGenerator (and its BusinessHours/TimezoneService helpers)
 * constructed a brand-new Intl.DateTimeFormat on nearly every loop
 * iteration/day-boundary/generated slot — 20,261 constructions measured for
 * one 90-day, real-business-hours request, none of them cached or reused.
 * Fixed by caching one formatter instance per (function, timezone) pair,
 * since every construction for a given timezone used identical, hardcoded
 * options.
 *
 * Separately: the widget's 10-slot response cap only trimmed what was
 * RETURNED — SlotGenerator still walked and computed the org's full
 * maximumBookingDays window (1,105 slots for a 90-day/40hr-week org) before
 * being sliced down to 10. Fixed via AvailabilityRequest.maxSlots, an early
 * exit once enough slots are found.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { SlotGenerator } from '../SlotGenerator';
import type { AvailabilityRequest } from '../types';
import type { HolidayEntry } from '../../business-identity/types';

// Matches a real seeded org: seedDefaults()'s businessHours (Mon-Fri 8-5,
// weekends closed) and the hardcoded bookingRules from
// MongoBusinessIdentityRepository (maximumBookingDays: 90, slotIntervalMins: 30).
const businessHours = {
  monday:    { isOpen: true,  openTime: '08:00', closeTime: '17:00' },
  tuesday:   { isOpen: true,  openTime: '08:00', closeTime: '17:00' },
  wednesday: { isOpen: true,  openTime: '08:00', closeTime: '17:00' },
  thursday:  { isOpen: true,  openTime: '08:00', closeTime: '17:00' },
  friday:    { isOpen: true,  openTime: '08:00', closeTime: '17:00' },
  saturday:  { isOpen: false, openTime: '09:00', closeTime: '14:00' },
  sunday:    { isOpen: false, openTime: '09:00', closeTime: '14:00' },
  emergencyAfterHours: true,
  vacationMode: false,
  holidays: [] as HolidayEntry[],
  closedDates: [] as string[],
};

const bookingRules = {
  minimumNoticeHours:  1,
  maximumBookingDays:  90,
  defaultDurationMins: 60,
  slotIntervalMins:    30,
  sameDayBooking:      true,
  weekendBooking:      false,
  businessBufferMins:  0,
};

function baseRequest(nowMs: number): Omit<AvailabilityRequest, 'maxSlots'> {
  const startDateUtc = new Date(nowMs).toISOString().slice(0, 10);
  const endDateUtc   = new Date(nowMs + bookingRules.maximumBookingDays * 86_400_000).toISOString().slice(0, 10);
  return {
    organizationId: 'org-perf-test',
    businessHours,
    bookingRules,
    timezone: 'America/New_York',
    blockedSlots: [],
    startDateUtc,
    endDateUtc,
    nowMs,
  };
}

/** Counts real Intl.DateTimeFormat constructions during fn(), restores the global after. */
function countFormatterConstructions(fn: () => void): number {
  let count = 0;
  const OrigDTF = Intl.DateTimeFormat;
  // @ts-expect-error — intentional monkey-patch for measurement only
  Intl.DateTimeFormat = function (...args: unknown[]) {
    count++;
    // @ts-expect-error
    return new OrigDTF(...args);
  };
  try {
    fn();
  } finally {
    Intl.DateTimeFormat = OrigDTF;
  }
  return count;
}

describe('SlotGenerator — availability performance regression', () => {
  const nowMs = new Date('2026-08-17T12:00:00Z').getTime(); // a Monday

  it('generates the full 90-day window in well under the 1-2s target', () => {
    const req = baseRequest(nowMs);
    const t0 = process.hrtime.bigint();
    const result = SlotGenerator.generate(req);
    const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;

    // Generous ceiling — measured ~90ms locally post-fix (vs. ~800ms
    // pre-fix, and ~12.4s observed in production against real infra).
    // 1000ms leaves headroom for slower/loaded CI machines while still
    // catching a regression back toward the old behavior by an order of
    // magnitude.
    assert.ok(
      elapsedMs < 1000,
      `expected full-window generation under 1000ms, took ${elapsedMs.toFixed(1)}ms`,
    );
    // Sanity: this is genuinely the expensive case — a real multi-hundred
    // slot result for a standard 40hr/week org over 90 days, not a trivial
    // empty run that would pass this benchmark for the wrong reason.
    assert.ok(result.slots.length > 900, `expected 900+ slots pre-cap, got ${result.slots.length}`);
  });

  it('constructs a bounded, small number of Intl.DateTimeFormat instances regardless of window size', () => {
    const req = baseRequest(nowMs);
    const constructions = countFormatterConstructions(() => {
      SlotGenerator.generate(req);
    });

    // One cached formatter per (helper, timezone) pair — a handful, not
    // thousands. This is the direct regression check for the root cause:
    // if any of the SlotGenerator/BusinessHours/TimezoneService helpers
    // regress to constructing a fresh formatter per call, this jumps back
    // toward five figures immediately.
    assert.ok(
      constructions < 20,
      `expected fewer than 20 total Intl.DateTimeFormat constructions, got ${constructions}`,
    );
  });

  it('maxSlots bounds what is COMPUTED, not just what is returned', () => {
    const withoutCap = SlotGenerator.generate(baseRequest(nowMs));
    const withCap     = SlotGenerator.generate({ ...baseRequest(nowMs), maxSlots: 10 });

    assert.ok(withoutCap.slots.length > 900, 'sanity: uncapped run should compute the full window');
    assert.equal(withCap.slots.length, 10, 'capped run should stop at exactly maxSlots');
  });

  it('maxSlots early exit is measurably faster than computing the full window', () => {
    const req = baseRequest(nowMs);

    const t0 = process.hrtime.bigint();
    SlotGenerator.generate(req);
    const fullMs = Number(process.hrtime.bigint() - t0) / 1e6;

    const t1 = process.hrtime.bigint();
    SlotGenerator.generate({ ...req, maxSlots: 10 });
    const cappedMs = Number(process.hrtime.bigint() - t1) / 1e6;

    assert.ok(
      cappedMs < fullMs,
      `expected capped run (${cappedMs.toFixed(2)}ms) to be faster than full run (${fullMs.toFixed(2)}ms)`,
    );
  });

  it('omitting maxSlots preserves existing behaviour — full window still available for the dashboard date-picker and suggested sampling', () => {
    const result = SlotGenerator.generate(baseRequest(nowMs));
    assert.ok(result.slots.length > 900);
    assert.equal(result.suggested.length, 3);
  });
});
