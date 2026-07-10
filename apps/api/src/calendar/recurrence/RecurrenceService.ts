/**
 * RecurrenceService.ts
 *
 * Handles recurring meeting rules.
 * Generates iCal RRULE strings and expands occurrences for conflict checking.
 * Supports daily, weekly, monthly, and custom recurrence with exception dates.
 */

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'custom';

export interface RecurrenceRule {
  frequency:       RecurrenceFrequency;
  interval?:       number;           // every N days/weeks/months
  daysOfWeek?:     number[];         // 0=Sun…6=Sat (for weekly)
  dayOfMonth?:     number;           // 1-31 (for monthly)
  count?:          number;           // max occurrences
  until?:          Date;             // end date
  exceptionDates?: string[];         // YYYY-MM-DD dates to skip
}

/** Convert a RecurrenceRule to an iCal RRULE string. */
export function toRRule(rule: RecurrenceRule): string {
  const FREQ_MAP: Record<RecurrenceFrequency, string> = {
    daily:   'DAILY',
    weekly:  'WEEKLY',
    monthly: 'MONTHLY',
    custom:  'DAILY',
  };

  const parts: string[] = [`FREQ=${FREQ_MAP[rule.frequency] ?? 'DAILY'}`];
  if (rule.interval && rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);

  if (rule.frequency === 'weekly' && rule.daysOfWeek?.length) {
    const DAYS = ['SU','MO','TU','WE','TH','FR','SA'];
    parts.push(`BYDAY=${rule.daysOfWeek.map(d => DAYS[d]).join(',')}`);
  }

  if (rule.frequency === 'monthly' && rule.dayOfMonth) {
    parts.push(`BYMONTHDAY=${rule.dayOfMonth}`);
  }

  if (rule.count)                          parts.push(`COUNT=${rule.count}`);
  if (rule.until) {
    const until = rule.until.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    parts.push(`UNTIL=${until}`);
  }

  return `RRULE:${parts.join(';')}`;
}

/**
 * Expand a recurrence rule into concrete dates between start and end.
 * Returns up to maxOccurrences dates.
 */
export function expandOccurrences(
  startDate:       Date,
  rule:            RecurrenceRule,
  rangeEnd:        Date,
  maxOccurrences   = 100,
): Date[] {
  const dates: Date[] = [];
  const exceptions    = new Set(rule.exceptionDates ?? []);
  const until         = rule.until ?? rangeEnd;
  const intervalMs    = (rule.interval ?? 1);

  let current = new Date(startDate);
  let count   = 0;

  while (current <= until && current <= rangeEnd && count < maxOccurrences) {
    const dateStr = current.toISOString().slice(0, 10);
    if (!exceptions.has(dateStr)) {
      const shouldInclude = checkDay(current, rule);
      if (shouldInclude) {
        dates.push(new Date(current));
        count++;
      }
    }

    // Advance cursor
    switch (rule.frequency) {
      case 'daily':
      case 'custom':
        current = new Date(current.getTime() + intervalMs * 86400_000);
        break;
      case 'weekly':
        current = new Date(current.getTime() + intervalMs * 7 * 86400_000);
        break;
      case 'monthly': {
        const next = new Date(current);
        next.setUTCMonth(next.getUTCMonth() + intervalMs);
        current = next;
        break;
      }
    }

    if (rule.count && count >= rule.count) break;
  }

  return dates;
}

function checkDay(date: Date, rule: RecurrenceRule): boolean {
  if (rule.frequency === 'weekly' && rule.daysOfWeek?.length) {
    return rule.daysOfWeek.includes(date.getUTCDay());
  }
  if (rule.frequency === 'monthly' && rule.dayOfMonth) {
    return date.getUTCDate() === rule.dayOfMonth;
  }
  return true;
}
