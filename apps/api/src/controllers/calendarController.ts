/**
 * calendarController.ts
 *
 * All calendar & scheduling API handlers.
 * Every route reads organizationId from req.organizationId.
 */

import { Request, Response, NextFunction } from 'express';
import { param }               from '../utils/params';
import { ApiError }            from '../middleware/errorHandler';
import { z }                   from 'zod';
import { parseQuery }          from '../utils/validate';

import { CalendarConnectionService } from '../calendar/providers/CalendarConnectionService';
import { MeetingTypeService }        from '../calendar/scheduling/MeetingTypeService';
import { WorkingHoursService }       from '../calendar/scheduling/WorkingHoursService';
import { HolidayService }            from '../calendar/scheduling/HolidayService';
import { AvailabilityEngine }        from '../calendar/availability/AvailabilityEngine';
import { BookingService }            from '../calendar/bookings/BookingService';
import { BookingAnalyticsService }   from '../calendar/analytics/BookingAnalyticsService';
import { SchedulingPolicyModel }     from '../models/SchedulingPolicy.model';
import { resolveTimezone }           from '../calendar/timezone/TimezoneService';
import { env }                       from '../config/env';

// ─── Calendar Connections ──────────────────────────────────────────────────────

export async function listConnections(req: Request, res: Response, next: NextFunction) {
  try {
    const conns = await CalendarConnectionService.list(req.organizationId!, req.user!.sub);
    res.json({ status: 'ok', data: conns });
  } catch (e) { next(e); }
}

export async function getGoogleAuthUrl(req: Request, res: Response, next: NextFunction) {
  try {
    const redirectUri = String(req.query.redirectUri ?? env.GOOGLE_REDIRECT_URI);
    const url = CalendarConnectionService.getGoogleAuthUrl(redirectUri);
    res.json({ status: 'ok', data: { url } });
  } catch (e) { next(e); }
}

export async function googleOAuthCallback(req: Request, res: Response, next: NextFunction) {
  try {
    const { code, state } = req.query as { code: string; state?: string };
    if (!code) throw new ApiError(400, 'Authorization code missing', 'MISSING_CODE');
    const redirectUri = env.GOOGLE_REDIRECT_URI ?? '';
    const conn = await CalendarConnectionService.connectGoogle(
      req.organizationId!, req.user!.sub, code, redirectUri
    );
    res.json({ status: 'ok', data: conn });
  } catch (e) { next(e); }
}

export async function getMicrosoftAuthUrl(req: Request, res: Response, next: NextFunction) {
  try {
    const redirectUri = String(req.query.redirectUri ?? `${req.protocol}://${req.get('host')}/api/v1/calendar/oauth/microsoft/callback`);
    const url = CalendarConnectionService.getMicrosoftAuthUrl(redirectUri);
    res.json({ status: 'ok', data: { url } });
  } catch (e) { next(e); }
}

export async function microsoftOAuthCallback(req: Request, res: Response, next: NextFunction) {
  try {
    const { code } = req.query as { code: string };
    if (!code) throw new ApiError(400, 'Authorization code missing', 'MISSING_CODE');
    const redirectUri = `${req.protocol}://${req.get('host')}/api/v1/calendar/oauth/microsoft/callback`;
    const conn = await CalendarConnectionService.connectMicrosoft(
      req.organizationId!, req.user!.sub, code, redirectUri
    );
    res.json({ status: 'ok', data: conn });
  } catch (e) { next(e); }
}

export async function disconnectCalendar(req: Request, res: Response, next: NextFunction) {
  try {
    await CalendarConnectionService.disconnect(req.organizationId!, param(req.params.id));
    res.status(204).send();
  } catch (e) { next(e); }
}

export async function reconnectCalendar(req: Request, res: Response, next: NextFunction) {
  try {
    const conn = await CalendarConnectionService.reconnect(req.organizationId!, param(req.params.id));
    res.json({ status: 'ok', data: conn });
  } catch (e) { next(e); }
}

export async function syncCalendars(req: Request, res: Response, next: NextFunction) {
  try {
    const ids = await CalendarConnectionService.syncCalendars(req.organizationId!, param(req.params.id));
    res.json({ status: 'ok', data: { calendarIds: ids } });
  } catch (e) { next(e); }
}

export async function updateCalendarIds(req: Request, res: Response, next: NextFunction) {
  try {
    const { calendarIds, primaryId } = req.body;
    const conn = await CalendarConnectionService.updateCalendarIds(
      req.organizationId!, param(req.params.id), calendarIds, primaryId
    );
    res.json({ status: 'ok', data: conn });
  } catch (e) { next(e); }
}

// ─── Meeting Types ─────────────────────────────────────────────────────────────

export async function listMeetingTypes(req: Request, res: Response, next: NextFunction) {
  try {
    const types = await MeetingTypeService.list(req.organizationId!);
    res.json({ status: 'ok', data: types });
  } catch (e) { next(e); }
}

export async function getMeetingType(req: Request, res: Response, next: NextFunction) {
  try {
    const mt = await MeetingTypeService.getById(req.organizationId!, param(req.params.id));
    res.json({ status: 'ok', data: mt });
  } catch (e) { next(e); }
}

export async function createMeetingType(req: Request, res: Response, next: NextFunction) {
  try {
    const mt = await MeetingTypeService.create(req.organizationId!, req.body);
    res.status(201).json({ status: 'ok', data: mt });
  } catch (e) { next(e); }
}

export async function updateMeetingType(req: Request, res: Response, next: NextFunction) {
  try {
    const mt = await MeetingTypeService.update(req.organizationId!, param(req.params.id), req.body);
    res.json({ status: 'ok', data: mt });
  } catch (e) { next(e); }
}

export async function deleteMeetingType(req: Request, res: Response, next: NextFunction) {
  try {
    await MeetingTypeService.delete(req.organizationId!, param(req.params.id));
    res.status(204).send();
  } catch (e) { next(e); }
}

export async function toggleMeetingType(req: Request, res: Response, next: NextFunction) {
  try {
    const { isActive } = req.body as { isActive: boolean };
    const mt = await MeetingTypeService.toggle(req.organizationId!, param(req.params.id), isActive);
    res.json({ status: 'ok', data: mt });
  } catch (e) { next(e); }
}

// ─── Availability ──────────────────────────────────────────────────────────────

const AvailabilityQuerySchema = z.object({
  meetingTypeId:  z.string().min(1),
  startDate:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guestTimezone:  z.string().optional().default('UTC'),
  assigneeId:     z.string().optional(),
});

export async function getAvailability(req: Request, res: Response, next: NextFunction) {
  try {
    const q  = parseQuery(AvailabilityQuerySchema, req.query);
    const mt = await MeetingTypeService.getById(req.organizationId!, q.meetingTypeId);

    const slots = await AvailabilityEngine.getAvailableSlots({
      organizationId:  req.organizationId!,
      assigneeId:      q.assigneeId ?? mt.routingRules.assigneeIds[0] ?? req.user!.sub,
      durationMinutes: mt.durationMinutes,
      bufferRules:     mt.bufferRules,
      startDate:       q.startDate,
      endDate:         q.endDate,
      guestTimezone:   resolveTimezone(q.guestTimezone),
      slotIntervalMin: 30,
    });

    res.json({ status: 'ok', data: slots });
  } catch (e) { next(e); }
}

export async function getNextSlot(req: Request, res: Response, next: NextFunction) {
  try {
    const q  = parseQuery(AvailabilityQuerySchema.pick({ meetingTypeId: true, guestTimezone: true }), req.query);
    const mt = await MeetingTypeService.getById(req.organizationId!, q.meetingTypeId);

    const slot = await AvailabilityEngine.getNextAvailableSlot({
      organizationId:  req.organizationId!,
      assigneeId:      mt.routingRules.assigneeIds[0] ?? req.user!.sub,
      durationMinutes: mt.durationMinutes,
      bufferRules:     mt.bufferRules,
      startDate:       new Date().toISOString().slice(0, 10),
      guestTimezone:   resolveTimezone(q.guestTimezone),
      slotIntervalMin: 30,
    });

    res.json({ status: 'ok', data: slot });
  } catch (e) { next(e); }
}

export async function getSuggestedSlots(req: Request, res: Response, next: NextFunction) {
  try {
    const q  = parseQuery(AvailabilityQuerySchema.pick({ meetingTypeId: true, guestTimezone: true }), req.query);
    const mt = await MeetingTypeService.getById(req.organizationId!, q.meetingTypeId);
    const count = Number(req.query.count ?? 5);

    const slots = await AvailabilityEngine.getSuggestedSlots({
      organizationId:  req.organizationId!,
      assigneeId:      mt.routingRules.assigneeIds[0] ?? req.user!.sub,
      durationMinutes: mt.durationMinutes,
      bufferRules:     mt.bufferRules,
      startDate:       new Date().toISOString().slice(0, 10),
      guestTimezone:   resolveTimezone(q.guestTimezone),
      slotIntervalMin: 30,
    }, count);

    res.json({ status: 'ok', data: slots });
  } catch (e) { next(e); }
}

// ─── Bookings ──────────────────────────────────────────────────────────────────

const BookingQuerySchema = z.object({
  status:       z.string().optional(),
  assigneeId:   z.string().optional(),
  meetingTypeId:z.string().optional(),
  fromDate:     z.string().optional(),
  toDate:       z.string().optional(),
  page:         z.coerce.number().int().min(1).optional(),
  limit:        z.coerce.number().int().min(1).max(100).optional(),
});

export async function listBookings(req: Request, res: Response, next: NextFunction) {
  try {
    const q      = parseQuery(BookingQuerySchema, req.query);
    const result = await BookingService.list(req.organizationId!, q);
    res.json({ status: 'ok', ...result });
  } catch (e) { next(e); }
}

export async function getBooking(req: Request, res: Response, next: NextFunction) {
  try {
    const booking = await BookingService.getById(req.organizationId!, param(req.params.id));
    res.json({ status: 'ok', data: booking });
  } catch (e) { next(e); }
}

export async function createBooking(req: Request, res: Response, next: NextFunction) {
  try {
    const { startUtc, ...rest } = req.body;
    const booking = await BookingService.create({
      ...rest,
      organizationId: req.organizationId!,
      startUtc:       new Date(startUtc),
    });
    res.status(201).json({ status: 'ok', data: booking });
  } catch (e) { next(e); }
}

export async function rescheduleBooking(req: Request, res: Response, next: NextFunction) {
  try {
    const { newStart, reason } = req.body as { newStart: string; reason?: string };
    if (!newStart) throw new ApiError(422, 'newStart is required', 'VALIDATION_ERROR');
    const booking = await BookingService.reschedule(
      req.organizationId!, param(req.params.id),
      { newStart: new Date(newStart), reason, userId: req.user!.sub }
    );
    res.json({ status: 'ok', data: booking });
  } catch (e) { next(e); }
}

export async function cancelBooking(req: Request, res: Response, next: NextFunction) {
  try {
    const { reason } = req.body as { reason?: string };
    const booking = await BookingService.cancel(req.organizationId!, param(req.params.id), reason, req.user!.sub);
    res.json({ status: 'ok', data: booking });
  } catch (e) { next(e); }
}

export async function confirmBooking(req: Request, res: Response, next: NextFunction) {
  try {
    const booking = await BookingService.confirm(req.organizationId!, param(req.params.id));
    res.json({ status: 'ok', data: booking });
  } catch (e) { next(e); }
}

export async function markNoShow(req: Request, res: Response, next: NextFunction) {
  try {
    const booking = await BookingService.markNoShow(req.organizationId!, param(req.params.id));
    res.json({ status: 'ok', data: booking });
  } catch (e) { next(e); }
}

export async function getBookingByCode(req: Request, res: Response, next: NextFunction) {
  try {
    const booking = await BookingService.getByConfirmationCode(param(req.params.code));
    res.json({ status: 'ok', data: booking });
  } catch (e) { next(e); }
}

// ─── Working Hours ─────────────────────────────────────────────────────────────

export async function getWorkingHours(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req.query.userId as string) ?? req.user!.sub;
    const wh     = await WorkingHoursService.get(req.organizationId!, userId);
    res.json({ status: 'ok', data: wh });
  } catch (e) { next(e); }
}

export async function upsertWorkingHours(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req.body.userId as string | undefined) ?? req.user!.sub;
    const wh     = await WorkingHoursService.upsert(req.organizationId!, userId, req.body);
    res.json({ status: 'ok', data: wh });
  } catch (e) { next(e); }
}

// ─── Holidays ─────────────────────────────────────────────────────────────────

export async function listHolidays(req: Request, res: Response, next: NextFunction) {
  try {
    const holidays = await HolidayService.list(req.organizationId!);
    res.json({ status: 'ok', data: holidays });
  } catch (e) { next(e); }
}

export async function createHoliday(req: Request, res: Response, next: NextFunction) {
  try {
    const holiday = await HolidayService.create(req.organizationId!, req.body);
    res.status(201).json({ status: 'ok', data: holiday });
  } catch (e) { next(e); }
}

export async function deleteHoliday(req: Request, res: Response, next: NextFunction) {
  try {
    await HolidayService.delete(req.organizationId!, param(req.params.id));
    res.status(204).send();
  } catch (e) { next(e); }
}

// ─── Scheduling Policy ─────────────────────────────────────────────────────────

export async function getPolicy(req: Request, res: Response, next: NextFunction) {
  try {
    const policy = await SchedulingPolicyModel.findOne({ organizationId: req.organizationId! }).lean();
    res.json({ status: 'ok', data: policy });
  } catch (e) { next(e); }
}

export async function upsertPolicy(req: Request, res: Response, next: NextFunction) {
  try {
    const doc = await SchedulingPolicyModel.findOneAndUpdate(
      { organizationId: req.organizationId! },
      { $set: { ...req.body, organizationId: req.organizationId! } },
      { upsert: true, new: true }
    );
    res.json({ status: 'ok', data: doc });
  } catch (e) { next(e); }
}

// ─── Analytics ─────────────────────────────────────────────────────────────────

export async function getCalendarAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const since  = req.query.since ? new Date(String(req.query.since)) : undefined;
    const stats  = await BookingAnalyticsService.getStats(req.organizationId!, since);
    res.json({ status: 'ok', data: stats });
  } catch (e) { next(e); }
}
