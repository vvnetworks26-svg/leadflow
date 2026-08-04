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
import { formatSlotLabel, utcToLocalIso, safeTimezone } from './TimezoneService';

const DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const;
type DayKey = typeof DAYS[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, weekday: 'short',
    });
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
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false,
    });
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
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    });
    const parts = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month?.padStart(2,'0')}-${parts.day?.padStart(2,'0')}`;
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** Advance cursor to the local start-of-day for a given timezone */
function advanceToNextDay(utcMs: number, timezone: string): number {
  // Jump to next midnight in local timezone by finding the next day boundary
  const cursor = new Date(utcMs + 86400_000);
  const dateStr = getLocalDateStr(cursor.getTime(), timezone);
  // Set to 00:00 local = convert dateStr + "00:00" to UTC
  try {
    const naive = new Date(`${dateStr}T00:00:00`);
    // Approximate: use UTC midnight of local date
    return new Date(`${dateStr}T00:00:00Z`).getTime();
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
