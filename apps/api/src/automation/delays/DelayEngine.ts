/**
 * DelayEngine.ts
 *
 * Computes the resume timestamp for a delay step.
 * Supports: minutes, hours, days, weeks, business_days,
 *           until_specific_date, until_business_hours, until_condition.
 */

import type { DelayConfig } from '../types';
import { WorkingHoursModel } from '../../models/WorkingHours.model';
import { localToUtc, utcToLocal } from '../../calendar/timezone/TimezoneService';

const MS: Record<string, number> = {
  minutes:       60_000,
  hours:         3_600_000,
  days:          86_400_000,
  weeks:         7 * 86_400_000,
  business_days: 0,   // handled separately
};

/**
 * Calculate when the workflow should resume after a delay step.
 * Returns a future Date.
 */
export async function computeResumeAt(
  config:         DelayConfig,
  organizationId: string,
  assigneeId?:    string,
): Promise<Date> {
  const now = new Date();

  // Until specific date
  if (config.untilDate) {
    const target = new Date(config.untilDate);
    return target > now ? target : now;
  }

  // Unit-based delay
  if (config.unit !== 'business_days') {
    const ms = (MS[config.unit] ?? MS.hours) * config.amount;
    let resumeAt = new Date(now.getTime() + ms);

    // Until next business hours
    if (config.untilBusinessHours) {
      resumeAt = await snapToBusinessHours(resumeAt, organizationId, assigneeId);
    }
    return resumeAt;
  }

  // Business days: skip weekends
  return addBusinessDays(now, config.amount);
}

function addBusinessDays(from: Date, days: number): Date {
  let count  = 0;
  let cursor = new Date(from);
  while (count < days) {
    cursor = new Date(cursor.getTime() + 86_400_000);
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) count++;  // skip Sat(6) Sun(0)
  }
  return cursor;
}

async function snapToBusinessHours(
  from:           Date,
  organizationId: string,
  assigneeId?:    string,
): Promise<Date> {
  if (!assigneeId) return from;

  const wh = await WorkingHoursModel.findOne({ organizationId, userId: assigneeId }).lean();
  if (!wh) return from;

  const tz      = wh.timezone ?? 'UTC';
  const local   = utcToLocal(from, tz);
  const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const;
  let cursor    = from;
  let attempts  = 0;

  while (attempts < 14) {
    const l        = utcToLocal(cursor, tz);
    const dayName  = dayNames[l.weekday];
    const dayWin   = (wh as any)[dayName];

    if (dayWin?.enabled) {
      const [sh, sm] = dayWin.startTime.split(':').map(Number);
      const localMin = l.hour * 60 + l.minute;
      const workMin  = sh * 60 + sm;

      if (localMin < workMin) {
        // Snap to start of today's working hours
        return localToUtc(
          `${l.year}-${String(l.month).padStart(2,'0')}-${String(l.day).padStart(2,'0')}`,
          dayWin.startTime,
          tz
        );
      }
      // Already within or after business hours today — return as-is
      return cursor;
    }

    // Skip to next day
    cursor = new Date(cursor.getTime() + 86_400_000);
    attempts++;
  }

  return from;  // fallback
}

/**
 * Check if a 'until_condition' delay should resume now.
 * Called by the scheduler on each poll tick.
 */
export function shouldResumeOnCondition(
  config: DelayConfig,
  ctx:    Record<string, unknown>,
): boolean {
  if (!config.untilCondition) return true;
  const { evaluateConditionGroup } = require('../conditions/ConditionEvaluator');
  return evaluateConditionGroup(config.untilCondition, ctx);
}
