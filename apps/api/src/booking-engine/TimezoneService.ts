/**
 * booking-engine/TimezoneService.ts
 *
 * Timezone utilities for the Booking Engine.
 * Wraps calendar/timezone/TimezoneService for use within this module.
 *
 * PURE — no I/O, no side effects.
 */

import {
  utcToLocal,
  localToUtc,
  isValidTimezone,
  formatForDisplay,
  resolveTimezone,
  getUtcOffsetMinutes,
} from '../calendar/timezone/TimezoneService';

export { isValidTimezone, resolveTimezone };

// ─── Slot display formatter ───────────────────────────────────────────────────

const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/**
 * Format a UTC date into a customer-friendly label in the given timezone.
 * Example: "Tuesday, Aug 5 at 2:00 PM"
 */
export function formatSlotLabel(utcIso: string, timezone: string): string {
  const tz = isValidTimezone(timezone) ? timezone : 'UTC';
  try {
    const d     = new Date(utcIso);
    const parts = utcToLocal(d, tz);
    const weekday = WEEKDAYS[parts.weekday] ?? '';
    const month   = MONTHS[parts.month - 1] ?? '';
    const hour    = parts.hour > 12 ? parts.hour - 12 : parts.hour === 0 ? 12 : parts.hour;
    const ampm    = parts.hour >= 12 ? 'PM' : 'AM';
    const min     = String(parts.minute).padStart(2, '0');
    return `${weekday}, ${month} ${parts.day} at ${hour}:${min} ${ampm}`;
  } catch {
    return utcIso;
  }
}

/**
 * Convert a YYYY-MM-DD + HH:MM local string to a UTC ISO string.
 */
export function localToUtcIso(dateStr: string, timeStr: string, timezone: string): string {
  return localToUtc(dateStr, timeStr, timezone).toISOString();
}

/**
 * Convert a UTC ISO string to a local ISO string in the given timezone.
 */
export function utcToLocalIso(utcIso: string, timezone: string): string {
  return utcToLocal(new Date(utcIso), timezone).iso;
}

/**
 * Returns UTC offset in ±HH:MM format for a timezone at a given date.
 * Example: "UTC-05:00"
 */
export function utcOffsetLabel(utcIso: string, timezone: string): string {
  const tz      = isValidTimezone(timezone) ? timezone : 'UTC';
  const minutes = getUtcOffsetMinutes(new Date(utcIso), tz);
  const sign    = minutes >= 0 ? '+' : '-';
  const abs     = Math.abs(minutes);
  const h       = String(Math.floor(abs / 60)).padStart(2, '0');
  const m       = String(abs % 60).padStart(2, '0');
  return `UTC${sign}${h}:${m}`;
}

/**
 * Format a full appointment time string for confirmations.
 * Example: "Tuesday, Aug 5 at 2:00 PM CDT"
 */
export function formatConfirmationTime(utcIso: string, timezone: string): string {
  const tz = isValidTimezone(timezone) ? timezone : 'UTC';
  try {
    return formatForDisplay(new Date(utcIso), tz);
  } catch {
    return utcIso;
  }
}

/**
 * Validates an IANA timezone string. Returns 'UTC' if invalid.
 */
export function safeTimezone(tz?: string): string {
  if (!tz) return 'UTC';
  return isValidTimezone(tz) ? tz : 'UTC';
}
