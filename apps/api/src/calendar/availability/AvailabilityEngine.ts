/**
 * AvailabilityEngine.ts
 *
 * Core scheduling brain. Computes available time slots for a given
 * assignee, meeting type, and date range.
 *
 * Inputs:  Working hours, holidays, busy intervals (external calendar),
 *          existing bookings, buffer rules, timezone, duration.
 * Outputs: Available TimeSlot[], next available slot, suggested slots.
 */

import { WorkingHoursModel, IWorkingHours, IDayWindow } from '../../models/WorkingHours.model';
import { HolidayModel }          from '../../models/Holiday.model';
import { SchedulingPolicyModel } from '../../models/SchedulingPolicy.model';
import { BookingModel }          from '../../models/Booking.model';
import { CalendarConnectionModel } from '../../models/CalendarConnection.model';
import { getProviderForUser }    from '../providers/ProviderFactory';
import { utcToLocal, localToUtc, getLocalDayName } from '../timezone/TimezoneService';
import type { BusyInterval }     from '../providers/ICalendarProvider';
import type { IBufferRule }      from '../../models/MeetingType.model';

export interface TimeSlot {
  startUtc:     Date;
  endUtc:       Date;
  startLocal:   string;    // ISO in assignee timezone
  endLocal:     string;
  timezone:     string;
  assigneeId:   string;
  available:    boolean;
}

export interface AvailabilityRequest {
  organizationId: string;
  assigneeId:     string;
  durationMinutes:number;
  bufferRules:    IBufferRule;
  startDate:      string;           // YYYY-MM-DD (guest's perspective)
  endDate:        string;           // YYYY-MM-DD
  guestTimezone:  string;
  slotIntervalMin:number;           // step between slots (e.g. 30)
}

const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const;

function overlaps(s1: Date, e1: Date, s2: Date, e2: Date): boolean {
  return s1 < e2 && e1 > s2;
}

function getDayWindow(wh: IWorkingHours, dayName: string): IDayWindow {
  return (wh as any)[dayName] as IDayWindow ?? { enabled: false, startTime: '09:00', endTime: '17:00', breaks: [] };
}

/** Check if a UTC date falls on a holiday. */
function isHoliday(utcDate: Date, holidays: Array<{ date: string; recurring: boolean }>): boolean {
  const iso  = utcDate.toISOString().slice(0, 10);
  const mmdd = iso.slice(5);
  return holidays.some(h => h.date === iso || (h.recurring && h.date.slice(5) === mmdd));
}

/** Add buffer to busy intervals. */
function applyBuffers(intervals: BusyInterval[], before: number, after: number): BusyInterval[] {
  return intervals.map(b => ({
    ...b,
    startUtc: new Date(b.startUtc.getTime() - before * 60_000),
    endUtc:   new Date(b.endUtc.getTime()   + after  * 60_000),
  }));
}

export const AvailabilityEngine = {

  async getAvailableSlots(req: AvailabilityRequest): Promise<TimeSlot[]> {
    const { organizationId, assigneeId, durationMinutes, bufferRules,
            startDate, endDate, guestTimezone, slotIntervalMin } = req;

    // Load working hours, policy, holidays
    const [workingHours, policy, holidays] = await Promise.all([
      WorkingHoursModel.findOne({ organizationId, userId: assigneeId }).lean(),
      SchedulingPolicyModel.findOne({ organizationId }).lean(),
      HolidayModel.find({ organizationId }).lean(),
    ]);

    const assigneeTimezone = workingHours?.timezone ?? policy?.defaultTimezone ?? 'UTC';
    const futureLimitDays  = policy?.futureLimitDays  ?? 90;
    const minNoticeHours   = 1;  // fallback

    // Clamp date range to policy limit
    const now       = new Date();
    const maxDate   = new Date(now.getTime() + futureLimitDays * 86400_000);
    const rangeStart = new Date(startDate + 'T00:00:00Z');
    const rangeEnd   = new Date(endDate   + 'T23:59:59Z');
    const effectiveEnd = rangeEnd > maxDate ? maxDate : rangeEnd;

    // Get busy intervals from provider
    const provider = await getProviderForUser(organizationId, assigneeId);
    const conn     = await CalendarConnectionModel.findOne({ organizationId, userId: assigneeId, status: 'connected' }).lean();
    const calIds   = conn?.calendarIds ?? [];

    let busy: BusyInterval[] = [];
    try {
      busy = await provider.getBusyIntervals(calIds, rangeStart, effectiveEnd);
    } catch { /* provider unavailable — use empty busy list */ }

    // Add buffer
    const bufferedBusy = applyBuffers(busy, bufferRules.before, bufferRules.after + bufferRules.cleanup);

    // Also add existing LeadFlow bookings as busy
    const existingBookings = await BookingModel.find({
      organizationId, assigneeId,
      status: { $in: ['confirmed', 'rescheduled'] },
      startUtc: { $gte: rangeStart, $lte: effectiveEnd },
    }).lean();

    for (const b of existingBookings) {
      bufferedBusy.push({
        startUtc: new Date(b.startUtc.getTime() - (bufferRules.before + bufferRules.travel) * 60_000),
        endUtc:   new Date(b.endUtc.getTime()   + (bufferRules.after  + bufferRules.cleanup) * 60_000),
        source:   'leadflow',
      });
    }

    // Generate candidate slots
    const slots: TimeSlot[] = [];
    const minNoticeMs = minNoticeHours * 3600_000;
    const step        = slotIntervalMin * 60_000;
    const dur         = durationMinutes * 60_000;

    let cursor = rangeStart;
    while (cursor < effectiveEnd) {
      const slotEnd = new Date(cursor.getTime() + dur);
      if (slotEnd > effectiveEnd) break;

      // Enforce minimum notice
      if (cursor.getTime() - now.getTime() < minNoticeMs) {
        cursor = new Date(cursor.getTime() + step);
        continue;
      }

      // Check holiday
      if (policy?.blockHolidays !== false && isHoliday(cursor, holidays as any)) {
        cursor = new Date(cursor.getTime() + 86400_000);
        continue;
      }

      // Check working hours
      const dayName   = DAY_NAMES[cursor.getUTCDay()];
      const dayWindow = workingHours ? getDayWindow(workingHours as IWorkingHours, dayName) : null;

      if (dayWindow && !dayWindow.enabled) {
        // Skip to next day
        const nextDay = new Date(cursor);
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        nextDay.setUTCHours(0, 0, 0, 0);
        cursor = nextDay;
        continue;
      }

      if (dayWindow && dayWindow.enabled) {
        const local     = utcToLocal(cursor, assigneeTimezone);
        const slotStart = local.hour * 60 + local.minute;
        const [sh, sm]  = dayWindow.startTime.split(':').map(Number);
        const [eh, em]  = dayWindow.endTime.split(':').map(Number);
        const workStart = sh * 60 + sm;
        const workEnd   = eh * 60 + em;

        if (slotStart < workStart) {
          // Jump to start of working hours
          cursor = localToUtc(
            `${local.year}-${String(local.month).padStart(2,'0')}-${String(local.day).padStart(2,'0')}`,
            dayWindow.startTime,
            assigneeTimezone,
          );
          continue;
        }

        if (slotStart + durationMinutes > workEnd) {
          // Skip to next day
          const nextDay = new Date(cursor);
          nextDay.setUTCDate(nextDay.getUTCDate() + 1);
          nextDay.setUTCHours(0, 0, 0, 0);
          cursor = nextDay;
          continue;
        }

        // Check breaks
        const inBreak = (dayWindow.breaks ?? []).some(br => {
          const [bsh, bsm] = br.startTime.split(':').map(Number);
          const [beh, bem] = br.endTime.split(':').map(Number);
          const bs = bsh * 60 + bsm;
          const be = beh * 60 + bem;
          return slotStart < be && (slotStart + durationMinutes) > bs;
        });
        if (inBreak) { cursor = new Date(cursor.getTime() + step); continue; }
      }

      // Check busy intervals
      const isBusy = bufferedBusy.some(b => overlaps(cursor, slotEnd, b.startUtc, b.endUtc));

      if (!isBusy) {
        const assigneeLocal = utcToLocal(cursor, assigneeTimezone);
        const guestLocal    = utcToLocal(cursor, guestTimezone);
        slots.push({
          startUtc:   cursor,
          endUtc:     slotEnd,
          startLocal: guestLocal.iso,
          endLocal:   utcToLocal(slotEnd, guestTimezone).iso,
          timezone:   guestTimezone,
          assigneeId,
          available:  true,
        });
      }

      cursor = new Date(cursor.getTime() + step);
    }

    return slots;
  },

  /** Return the single next available slot. */
  async getNextAvailableSlot(req: Omit<AvailabilityRequest, 'endDate'>): Promise<TimeSlot | null> {
    const start = req.startDate;
    const end   = new Date(new Date(start).getTime() + 14 * 86400_000).toISOString().slice(0, 10);
    const slots = await AvailabilityEngine.getAvailableSlots({ ...req, endDate: end });
    return slots[0] ?? null;
  },

  /** Return up to N suggested slots spread across the next 7 days. */
  async getSuggestedSlots(
    req:   Omit<AvailabilityRequest, 'endDate'>,
    count: number = 5,
  ): Promise<TimeSlot[]> {
    const start = req.startDate;
    const end   = new Date(new Date(start).getTime() + 14 * 86400_000).toISOString().slice(0, 10);
    const slots = await AvailabilityEngine.getAvailableSlots({ ...req, endDate: end });
    // Pick evenly distributed suggestions
    const step = Math.max(1, Math.floor(slots.length / count));
    return slots.filter((_, i) => i % step === 0).slice(0, count);
  },
};
