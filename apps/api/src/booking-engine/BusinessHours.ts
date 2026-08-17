/**
 * booking-engine/BusinessHours.ts
 *
 * Pure business hours logic for the Booking Engine.
 * Determines whether a given UTC moment falls within open hours,
 * respecting holidays, closed dates, and vacation mode.
 *
 * PURE — no I/O, no side effects.
 */

import type { BusinessHours, DaySchedule, HolidayEntry } from '../business-identity/types';

const DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const;
type DayKey = typeof DAYS[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────

// isWeekend()/isSameDay() call this once per SlotGenerator loop iteration — a
// fresh Intl.DateTimeFormat per call was part of the ~20k-construction cost
// behind a ~12s availability request (see SlotGenerator.ts). The shape is
// fixed per timezone, so one cached instance is safe to reuse indefinitely.
const localComponentsFormatters = new Map<string, Intl.DateTimeFormat>();

function toMinutes(time: string): number {
  const [h = '0', m = '0'] = time.split(':');
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}

function getLocalComponents(utcMs: number, timezone: string): {
  dow:    number;
  dayKey: DayKey;
  minutes:number;
  dateStr:string;   // YYYY-MM-DD
} {
  const d   = new Date(utcMs);
  const tz  = timezone || 'UTC';
  try {
    let fmt = localComponentsFormatters.get(tz);
    if (!fmt) {
      fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        weekday:  'short',
        hour:     '2-digit',
        minute:   '2-digit',
        hour12:   false,
        year:     'numeric',
        month:    '2-digit',
        day:      '2-digit',
      });
      localComponentsFormatters.set(tz, fmt);
    }
    const parts = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, p.value]));
    const weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const dow      = weekdays.indexOf(parts.weekday ?? 'Mon');
    const hour     = parseInt(parts.hour ?? '0', 10) % 24;
    const minute   = parseInt(parts.minute ?? '0', 10);
    const month    = parts.month?.padStart(2, '0') ?? '01';
    const day      = parts.day?.padStart(2, '0') ?? '01';
    const year     = parts.year ?? '2026';
    return {
      dow,
      dayKey:  DAYS[dow] ?? 'monday',
      minutes: hour * 60 + minute,
      dateStr: `${year}-${month}-${day}`,
    };
  } catch {
    // Fallback: UTC
    const dow     = d.getUTCDay();
    const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
    const dateStr = d.toISOString().slice(0, 10);
    return { dow, dayKey: DAYS[dow] ?? 'monday', minutes, dateStr };
  }
}

function isHolidayDate(dateStr: string, holidays: readonly HolidayEntry[]): boolean {
  const mmdd = dateStr.slice(5);
  return holidays.some(h =>
    h.date === dateStr || (h.recurring && h.date === mmdd)
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const BusinessHoursService = {

  /**
   * Returns true if the business is open at `nowMs` in `timezone`.
   */
  isOpen(hours: BusinessHours, timezone: string, nowMs: number = Date.now()): boolean {
    if (hours.vacationMode) return false;

    const { dayKey, minutes, dateStr } = getLocalComponents(nowMs, timezone);

    if (hours.closedDates.includes(dateStr)) return false;
    if (isHolidayDate(dateStr, hours.holidays)) return false;

    const schedule = hours[dayKey] as DaySchedule;
    if (!schedule?.isOpen) return false;

    const open  = toMinutes(schedule.openTime);
    const close = toMinutes(schedule.closeTime);
    return minutes >= open && minutes < close;
  },

  /**
   * Returns true if a slot (startMs–endMs) falls entirely within open hours.
   */
  slotIsWithinHours(
    hours:    BusinessHours,
    timezone: string,
    startMs:  number,
    endMs:    number,
  ): boolean {
    // Check every 15 min within the slot
    let cursor = startMs;
    while (cursor < endMs) {
      if (!BusinessHoursService.isOpen(hours, timezone, cursor)) return false;
      cursor += 15 * 60_000;
    }
    return true;
  },

  /**
   * Returns true if the date (from startMs) is a weekend in the given timezone.
   */
  isWeekend(timezone: string, startMs: number): boolean {
    const { dow } = getLocalComponents(startMs, timezone);
    return dow === 0 || dow === 6;  // Sunday = 0, Saturday = 6
  },

  /**
   * Returns true if today is the same local date as startMs (same-day booking check).
   */
  isSameDay(timezone: string, startMs: number, nowMs: number = Date.now()): boolean {
    const a = getLocalComponents(startMs, timezone).dateStr;
    const b = getLocalComponents(nowMs, timezone).dateStr;
    return a === b;
  },

  /**
   * Returns the next opening time (UTC ms) after nowMs.
   * Returns null if business is in vacation mode or no open hours exist.
   * Searches up to 14 days ahead.
   */
  nextOpeningTime(hours: BusinessHours, timezone: string, nowMs: number = Date.now()): number | null {
    if (hours.vacationMode) return null;
    const limit = nowMs + 14 * 86400_000;
    let   cursor = nowMs + 60_000;  // start 1 minute ahead
    while (cursor < limit) {
      if (BusinessHoursService.isOpen(hours, timezone, cursor)) return cursor;
      cursor += 15 * 60_000;
    }
    return null;
  },
};
