/**
 * TimezoneService.ts
 *
 * Handles all timezone conversions for the scheduling platform.
 * Stores everything in UTC internally.
 * Converts to/from local time for display and slot calculation.
 * Uses native Intl API — no heavy external library needed.
 */

// ─── IANA timezone validation ─────────────────────────────────────────────────

const KNOWN_TIMEZONES = Intl.supportedValuesOf
  ? Intl.supportedValuesOf('timeZone')
  : [];                                          // fallback for older Node

export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ─── Conversion helpers ───────────────────────────────────────────────────────

/**
 * Convert a UTC Date to a local wall-clock string in the given timezone.
 * Returns an object with individual date/time components.
 */
export function utcToLocal(utcDate: Date, timezone: string): {
  year:   number; month: number; day:    number;
  hour:   number; minute:number; second: number;
  weekday:number; iso:   string;
} {
  const tz = isValidTimezone(timezone) ? timezone : 'UTC';
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone:   tz,
    year:       'numeric', month:  '2-digit', day:    '2-digit',
    hour:       '2-digit', minute: '2-digit', second: '2-digit',
    hour12:     false,     weekday:'short',
  });

  const parts = Object.fromEntries(fmt.formatToParts(utcDate).map(p => [p.type, p.value]));

  const year    = parseInt(parts.year,   10);
  const month   = parseInt(parts.month,  10);
  const day     = parseInt(parts.day,    10);
  const hour    = parseInt(parts.hour,   10) % 24;
  const minute  = parseInt(parts.minute, 10);
  const second  = parseInt(parts.second, 10);

  const weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const weekday  = weekdays.indexOf(parts.weekday);

  const iso = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:${String(second).padStart(2,'0')}`;

  return { year, month, day, hour, minute, second, weekday, iso };
}

/**
 * Convert a local wall-clock time string to UTC.
 * dateStr: 'YYYY-MM-DD', timeStr: 'HH:MM', timezone: IANA
 */
export function localToUtc(dateStr: string, timeStr: string, timezone: string): Date {
  const tz  = isValidTimezone(timezone) ? timezone : 'UTC';
  const iso = `${dateStr}T${timeStr}:00`;

  // Use a trick: format the same ISO string as UTC and find the offset
  const naiveMs   = new Date(iso + 'Z').getTime();
  const localParts = utcToLocal(new Date(naiveMs), tz);
  const naiveParsed = `${localParts.year}-${String(localParts.month).padStart(2,'0')}-${String(localParts.day).padStart(2,'0')}T${String(localParts.hour).padStart(2,'0')}:${String(localParts.minute).padStart(2,'0')}`;

  // Binary search for the actual UTC time that produces the desired local time
  // (handles DST correctly)
  let lo = naiveMs - 14 * 3600_000;
  let hi = naiveMs + 14 * 3600_000;
  const target = iso;

  for (let i = 0; i < 40; i++) {
    const mid  = Math.floor((lo + hi) / 2);
    const midLocal = utcToLocal(new Date(mid), tz);
    const midIso   = `${midLocal.year}-${String(midLocal.month).padStart(2,'0')}-${String(midLocal.day).padStart(2,'0')}T${String(midLocal.hour).padStart(2,'0')}:${String(midLocal.minute).padStart(2,'0')}`;
    if (midIso < target) lo = mid;
    else                 hi = mid;
  }

  return new Date(Math.floor((lo + hi) / 2));
}

/**
 * Get the UTC offset in minutes for a timezone at a given date.
 * Positive = ahead of UTC, negative = behind UTC.
 */
export function getUtcOffsetMinutes(date: Date, timezone: string): number {
  const tz  = isValidTimezone(timezone) ? timezone : 'UTC';
  const utcStr   = date.toISOString().slice(0, 16).replace('T', ' ');
  const local    = utcToLocal(date, tz);
  const localStr = `${local.year}-${String(local.month).padStart(2,'0')}-${String(local.day).padStart(2,'0')} ${String(local.hour).padStart(2,'0')}:${String(local.minute).padStart(2,'0')}`;

  const utcMs   = new Date(utcStr.replace(' ', 'T') + ':00Z').getTime();
  const localMs = new Date(localStr.replace(' ', 'T') + ':00Z').getTime();
  return Math.round((localMs - utcMs) / 60_000);
}

/**
 * Get the day-of-week name (lowercase) for a UTC date in a given timezone.
 */
export function getLocalDayName(utcDate: Date, timezone: string): string {
  const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  return days[utcToLocal(utcDate, timezone).weekday] ?? 'monday';
}

/**
 * Format a UTC date for display in a given timezone.
 */
export function formatForDisplay(utcDate: Date, timezone: string): string {
  const tz = isValidTimezone(timezone) ? timezone : 'UTC';
  return utcDate.toLocaleString('en-US', {
    timeZone:    tz,
    weekday:     'short',
    month:       'short',
    day:         'numeric',
    year:        'numeric',
    hour:        '2-digit',
    minute:      '2-digit',
    hour12:      true,
    timeZoneName:'short',
  });
}

/**
 * Detect timezone from a hint string (e.g. from browser Intl.resolvedOptions().timeZone).
 * Returns 'UTC' as fallback.
 */
export function resolveTimezone(hint?: string): string {
  if (hint && isValidTimezone(hint)) return hint;
  return 'UTC';
}

export { KNOWN_TIMEZONES };
