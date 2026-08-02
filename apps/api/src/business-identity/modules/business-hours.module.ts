/**
 * business-identity/modules/business-hours.module.ts
 *
 * All business-hours queries.
 * Pure functions — no side effects, no DB calls.
 * All times are evaluated in the business's local timezone.
 */

import type { BusinessHours, DaySchedule } from '../types';

const DOW = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const;
type DowKey = typeof DOW[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDaySchedule(hours: BusinessHours, dow: number): DaySchedule {
  return hours[DOW[dow] as DowKey] as DaySchedule;
}

/** Parse "HH:MM" into minutes-since-midnight */
function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Convert a UTC Date to a local time represented as { dow, minutes }
 * using a simple offset-based approach compatible with Node without extra deps.
 * For production accuracy, swap with `Intl.DateTimeFormat` or `luxon`.
 */
function toLocalComponents(
  utcDate: Date,
  timezone: string,
): { dow: number; minutes: number; dateStr: string } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone:    timezone,
    weekday:     'long',
    hour:        '2-digit',
    minute:      '2-digit',
    hour12:      false,
    year:        'numeric',
    month:       '2-digit',
    day:         '2-digit',
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(utcDate).map(p => [p.type, p.value])
  );

  const dowName  = (parts.weekday ?? '').toLowerCase() as DowKey;
  const dow      = DOW.indexOf(dowName);
  const hours    = parseInt(parts.hour   ?? '0', 10);
  const mins     = parseInt(parts.minute ?? '0', 10);
  const minutes  = hours * 60 + mins;
  const dateStr  = `${parts.year}-${parts.month}-${parts.day}`;   // YYYY-MM-DD

  return { dow, minutes, dateStr };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns true if the business is open at the given UTC time.
 *
 * Checks (in order):
 *   1. Vacation mode → always closed
 *   2. closedDates → closed for that date
 *   3. holidays (recurring or exact) → closed
 *   4. Day schedule → open/close window
 */
export function isOpen(hours: BusinessHours, timezone: string, utcNow: Date = new Date()): boolean {
  if (hours.vacationMode) return false;

  const { dow, minutes, dateStr } = toLocalComponents(utcNow, timezone);

  // Check explicit closed date
  if (hours.closedDates.includes(dateStr)) return false;

  // Check holidays
  const mmdd = dateStr.slice(5);   // MM-DD
  const isHoliday = hours.holidays.some(h =>
    h.date === dateStr || (h.recurring && h.date === mmdd)
  );
  if (isHoliday) return false;

  // Check day schedule
  const schedule = getDaySchedule(hours, dow);
  if (!schedule.isOpen) return false;

  return minutes >= toMinutes(schedule.openTime) && minutes < toMinutes(schedule.closeTime);
}

/**
 * Returns the next opening UTC time from `utcNow`, searching up to 14 days ahead.
 * Returns null if no opening is found (vacation mode or fully closed schedule).
 */
export function nextOpeningTime(
  hours:    BusinessHours,
  timezone: string,
  utcNow:   Date = new Date(),
): Date | null {
  if (hours.vacationMode) return null;

  // Probe every 15-minute slot for up to 14 days
  const candidate = new Date(utcNow.getTime());
  const limit     = new Date(utcNow.getTime() + 14 * 24 * 60 * 60 * 1000);

  while (candidate < limit) {
    candidate.setTime(candidate.getTime() + 15 * 60 * 1000);
    if (isOpen(hours, timezone, candidate)) return new Date(candidate);
  }

  return null;
}

/**
 * Returns true if the business has emergency after-hours service enabled.
 */
export function hasEmergencyAfterHours(hours: BusinessHours): boolean {
  return hours.emergencyAfterHours;
}
