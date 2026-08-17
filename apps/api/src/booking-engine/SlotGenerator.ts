/**
 * booking-engine/SlotGenerator.ts
 *
 * Generates clean, customer-friendly appointment slots from business hours.
 *
 * This is the pure core of availability — it has NO DB dependency.
 * It takes business hours + blocked slots and produces available AppointmentSlots.
 *
 * PURE — no I/O, no side effects.
 */

import type { AvailabilityRequest, AvailabilityResponse, AppointmentSlot, BlockedSlot } from './types';
import type { DaySchedule } from '../business-identity/types';
import { BusinessHoursService } from './BusinessHours';
import { formatSlotLabel, utcToLocalIso, localToUtcIso, safeTimezone } from './TimezoneService';

const DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const;
type DayKey = typeof DAYS[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────

// getLocalDayKey/getLocalMinutes/getLocalDateStr each run once per loop
// iteration while walking the org's full maximumBookingDays window (up to
// tens of thousands of iterations for a 90-day window) — constructing a new
// Intl.DateTimeFormat per call here was the dominant cost in a ~12s
// availability request (20,261 Intl.DateTimeFormat constructions measured
// for one call). Each shape below is fixed (only timeZone varies), so one
// cached instance per timezone is safe to reuse indefinitely.
const dayKeyFormatters  = new Map<string, Intl.DateTimeFormat>();
const minutesFormatters = new Map<string, Intl.DateTimeFormat>();
const dateStrFormatters = new Map<string, Intl.DateTimeFormat>();

function cached(cache: Map<string, Intl.DateTimeFormat>, timezone: string, build: () => Intl.DateTimeFormat): Intl.DateTimeFormat {
  let fmt = cache.get(timezone);
  if (!fmt) {
    fmt = build();
    cache.set(timezone, fmt);
  }
  return fmt;
}

function toMinutes(time: string): number {
  const [h = '0', m = '0'] = time.split(':');
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}

function overlaps(
  aStart: number, aEnd: number,
  bStart: number, bEnd: number,
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function getLocalDayKey(utcMs: number, timezone: string): DayKey {
  const d = new Date(utcMs);
  try {
    const fmt = cached(dayKeyFormatters, timezone, () => new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, weekday: 'short',
    }));
    const parts = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, p.value]));
    const map: Record<string, DayKey> = {
      Sun: 'sunday', Mon: 'monday', Tue: 'tuesday', Wed: 'wednesday',
      Thu: 'thursday', Fri: 'friday', Sat: 'saturday',
    };
    return map[parts.weekday ?? 'Mon'] ?? 'monday';
  } catch {
    const dow = d.getUTCDay();
    return DAYS[dow] ?? 'monday';
  }
}

function getLocalMinutes(utcMs: number, timezone: string): number {
  const d = new Date(utcMs);
  try {
    const fmt = cached(minutesFormatters, timezone, () => new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false,
    }));
    const parts = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, p.value]));
    const h = parseInt(parts.hour ?? '0', 10) % 24;
    const m = parseInt(parts.minute ?? '0', 10);
    return h * 60 + m;
  } catch {
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  }
}

function getLocalDateStr(utcMs: number, timezone: string): string {
  const d = new Date(utcMs);
  try {
    const fmt = cached(dateStrFormatters, timezone, () => new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    }));
    const parts = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month?.padStart(2,'0')}-${parts.day?.padStart(2,'0')}`;
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/**
 * Advance cursor to the local start-of-day *after* the local day utcMs falls
 * on, expressed back in UTC. Must always move strictly forward.
 *
 * The local date is derived from utcMs itself (not utcMs + 1 day) and one
 * calendar day is added to its date components — not to the raw UTC ms —
 * before converting back to UTC via the real (DST-aware) local→UTC
 * conversion. Deriving the next date from utcMs + 86_400_000 and then
 * reinterpreting that date string as if it were already UTC (as this used
 * to do) silently drops the timezone offset: for any negative-offset zone
 * (all of the US) it can resolve back to the *same* local day, so callers
 * that only stop advancing once the day changes never see progress and
 * spin forever.
 */
function advanceToNextDay(utcMs: number, timezone: string): number {
  const dateStr    = getLocalDateStr(utcMs, timezone);
  const [y, m, d]  = dateStr.split('-').map(Number);
  const nextDateStr = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  try {
    const nextMidnightUtc = new Date(localToUtcIso(nextDateStr, '00:00', timezone)).getTime();
    // Defensive floor — guarantees forward progress even if conversion
    // ever returns something unexpected for a given zone/date.
    return nextMidnightUtc > utcMs ? nextMidnightUtc : utcMs + 86400_000;
  } catch {
    return utcMs + 86400_000;
  }
}

// ─── Slot generator ───────────────────────────────────────────────────────────

export const SlotGenerator = {

  /**
   * Generate all available appointment slots for a given date range.
   * Pure function — all I/O must be done by the caller (blocked slots injected).
   */
  generate(req: AvailabilityRequest): AvailabilityResponse {
    const {
      businessHours,
      bookingRules,
      timezone,
      blockedSlots,
      startDateUtc,
      nowMs = Date.now(),
    } = req;

    const maxSlots     = req.maxSlots;
    const guestTz      = safeTimezone(req.guestTimezone ?? timezone);
    const durationMins = req.durationMinutes ?? bookingRules.defaultDurationMins;
    const intervalMins = bookingRules.slotIntervalMins;
    const durationMs   = durationMins * 60_000;
    const intervalMs   = intervalMins * 60_000;
    const minNoticeMs  = bookingRules.minimumNoticeHours * 3600_000;
    const maxDays      = bookingRules.maximumBookingDays;

    // Date range
    const rangeStartMs = new Date(startDateUtc + 'T00:00:00Z').getTime();
    const defaultEnd   = new Date(rangeStartMs + 7 * 86400_000).toISOString().slice(0, 10);
    const endDateUtc   = req.endDateUtc ?? defaultEnd;
    const rangeEndMs   = new Date(endDateUtc + 'T23:59:59Z').getTime();
    const maxFutureMs  = nowMs + maxDays * 86400_000;
    const effectiveEnd = Math.min(rangeEndMs, maxFutureMs);

    // Pre-compute blocked intervals as ms pairs
    const blocked = blockedSlots.map(b => ({
      start: new Date(b.startUtc).getTime(),
      end:   new Date(b.endUtc).getTime(),
    }));

    const slots: AppointmentSlot[] = [];
    let cursor = rangeStartMs;

    while (cursor < effectiveEnd) {
      const slotEnd = cursor + durationMs;
      if (slotEnd > effectiveEnd) break;

      // Minimum notice check
      if (cursor - nowMs < minNoticeMs) {
        cursor += intervalMs;
        continue;
      }

      const dayKey  = getLocalDayKey(cursor, timezone);
      const schedule = businessHours[dayKey] as DaySchedule | undefined;

      // Vacation / closed
      if (businessHours.vacationMode) break;

      // Day not open
      if (!schedule?.isOpen) {
        cursor = advanceToNextDay(cursor, timezone) || (cursor + 86400_000);
        continue;
      }

      // Weekend rule
      if (!bookingRules.weekendBooking && BusinessHoursService.isWeekend(timezone, cursor)) {
        cursor = advanceToNextDay(cursor, timezone) || (cursor + 86400_000);
        continue;
      }

      // Same-day rule
      if (!bookingRules.sameDayBooking && BusinessHoursService.isSameDay(timezone, cursor, nowMs)) {
        // Advance to next day
        cursor = advanceToNextDay(cursor, timezone) || (cursor + 86400_000);
        continue;
      }

      // Holiday / closed-date check
      const dateStr = getLocalDateStr(cursor, timezone);
      const mmdd    = dateStr.slice(5);
      const isHoliday = businessHours.holidays.some(
        h => h.date === dateStr || (h.recurring && h.date === mmdd)
      );
      if (isHoliday || businessHours.closedDates.includes(dateStr)) {
        cursor = advanceToNextDay(cursor, timezone) || (cursor + 86400_000);
        continue;
      }

      // Working hours window
      const localMinutes = getLocalMinutes(cursor, timezone);
      const openMin      = toMinutes(schedule.openTime);
      const closeMin     = toMinutes(schedule.closeTime);

      if (localMinutes < openMin) {
        // Jump forward to opening
        cursor += (openMin - localMinutes) * 60_000;
        continue;
      }

      if (localMinutes + durationMins > closeMin) {
        // Past close — go to next day
        cursor = advanceToNextDay(cursor, timezone) || (cursor + 86400_000);
        continue;
      }

      // Buffer before/after
      const bufferMs    = (bookingRules.businessBufferMins ?? 0) * 60_000;
      const bufferedStart = cursor - bufferMs;
      const bufferedEnd   = slotEnd + bufferMs;

      // Double-booking / blocked check
      const isBlocked = blocked.some(b =>
        overlaps(bufferedStart, bufferedEnd, b.start, b.end)
      );

      if (!isBlocked) {
        const startIso   = new Date(cursor).toISOString();
        const endIso     = new Date(slotEnd).toISOString();
        const startLocal = utcToLocalIso(startIso, timezone);
        const endLocal   = utcToLocalIso(endIso, timezone);
        const label      = formatSlotLabel(startIso, guestTz);

        slots.push({
          startUtc:        startIso,
          endUtc:          endIso,
          startLocal,
          endLocal,
          displayLabel:    label,
          timezone:        guestTz,
          durationMinutes: durationMins,
          available:       true,
        });

        // Stop computing once the caller has as many as it will ever use —
        // e.g. the widget's fixed-size SlotPicker. Only when maxSlots was
        // explicitly requested; open-ended callers (dashboard date-picker,
        // suggested's evenly-distributed sampling) still get the full window.
        if (maxSlots !== undefined && slots.length >= maxSlots) break;
      }

      cursor += intervalMs;
    }

    // Suggested = first 3 evenly distributed
    const step       = Math.max(1, Math.floor(slots.length / 3));
    const suggested  = slots.filter((_, i) => i % step === 0).slice(0, 3);
    const next       = slots[0] ?? null;

    return {
      slots,
      nextAvailable:  next,
      suggested,
      hasOpenSlots:   slots.length > 0,
      rangeStart:     startDateUtc,
      rangeEnd:       endDateUtc,
    };
  },

  /**
   * Generate just the next available slot (fast path).
   */
  nextSlot(req: AvailabilityRequest): AppointmentSlot | null {
    const result = SlotGenerator.generate({ ...req, endDateUtc: undefined });
    return result.nextAvailable;
  },
};
