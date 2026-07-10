/**
 * BookingService.ts
 *
 * Core booking engine. Handles creation, double-booking prevention,
 * rescheduling, cancellation, and confirmation.
 */

import { randomBytes }          from 'crypto';
import { BookingModel, IBooking } from '../../models/Booking.model';
import { MeetingTypeModel }       from '../../models/MeetingType.model';
import { SchedulingPolicyModel }  from '../../models/SchedulingPolicy.model';
import { HolidayModel }           from '../../models/Holiday.model';
import { RoutingService }         from '../routing/RoutingService';
import { AvailabilityEngine }     from '../availability/AvailabilityEngine';
import { MeetingService }         from '../meetings/MeetingService';
import { WorkflowEngine }         from '../../automation/engine/WorkflowEngine';
import { ReminderService }        from '../reminders/ReminderService';
import { BookingAnalyticsService }from '../analytics/BookingAnalyticsService';
import { ActivityService }        from '../../crm/activities/ActivityService';
import { AutomationService }      from '../../crm/automation/AutomationService';
import { ApiError }               from '../../middleware/errorHandler';
import { resolveTimezone }        from '../timezone/TimezoneService';
import { PaginatedResult, paginated } from '../../utils/query';

function genConfirmationCode(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

export interface CreateBookingInput {
  organizationId:   string;
  meetingTypeId:    string;
  guestName:        string;
  guestEmail:       string;
  guestPhone?:      string;
  guestTimezone?:   string;
  startUtc:         Date;
  notes?:           string;
  leadId?:          string;
  customFieldValues?:Record<string, unknown>;
  requestedAssigneeId?: string;
}

export interface RescheduleInput {
  reason?:  string;
  newStart: Date;
  userId:   string;
}

export interface BookingQuery {
  status?:     string;
  assigneeId?: string;
  meetingTypeId?: string;
  fromDate?:   string;
  toDate?:     string;
  page?:       number;
  limit?:      number;
}

export const BookingService = {

  async create(input: CreateBookingInput): Promise<IBooking> {
    const { organizationId, meetingTypeId, startUtc } = input;

    // Load meeting type
    const meetingType = await MeetingTypeModel.findOne({ _id: meetingTypeId, organizationId });
    if (!meetingType) throw new ApiError(404, 'Meeting type not found', 'MEETING_TYPE_NOT_FOUND');
    if (!meetingType.isActive) throw new ApiError(400, 'This meeting type is not accepting bookings', 'MEETING_TYPE_INACTIVE');

    const durationMs = meetingType.durationMinutes * 60_000;
    const endUtc     = new Date(startUtc.getTime() + durationMs);
    const guestTz    = resolveTimezone(input.guestTimezone);

    // Load policy
    const policy = await SchedulingPolicyModel.findOne({ organizationId }).lean();

    // Validate booking constraints
    const now = new Date();

    // Past date check
    if (startUtc < now) throw new ApiError(400, 'Cannot book a slot in the past', 'PAST_SLOT');

    // Future limit check
    const maxDays  = policy?.futureLimitDays ?? 90;
    const maxDate  = new Date(now.getTime() + maxDays * 86400_000);
    if (startUtc > maxDate) throw new ApiError(400, `Cannot book more than ${maxDays} days in advance`, 'TOO_FAR_AHEAD');

    // Minimum notice check
    const minNoticeMs = (meetingType.minNoticeHours ?? 1) * 3600_000;
    if (startUtc.getTime() - now.getTime() < minNoticeMs) {
      throw new ApiError(400, 'Insufficient notice for this booking', 'INSUFFICIENT_NOTICE');
    }

    // Holiday check
    if (policy?.blockHolidays !== false) {
      const dateStr  = startUtc.toISOString().slice(0, 10);
      const mmdd     = dateStr.slice(5);
      const holiday  = await HolidayModel.findOne({
        organizationId,
        $or: [{ date: dateStr }, { date: { $regex: mmdd + '$' }, recurring: true }],
      });
      if (holiday) throw new ApiError(400, `${holiday.name} is a holiday — no bookings available`, 'HOLIDAY_BLOCKED');
    }

    // Route to assignee
    const assigneeId = input.requestedAssigneeId
      ?? await RoutingService.selectAssignee({
           organizationId,
           routingRules: meetingType.routingRules,
           startUtc, endUtc,
         });
    if (!assigneeId) throw new ApiError(409, 'No available team member for this slot', 'NO_ASSIGNEE');

    // Double-booking prevention — check existing bookings for this assignee
    const conflict = await BookingModel.findOne({
      organizationId,
      assigneeId,
      status: { $in: ['confirmed', 'rescheduled', 'pending'] },
      $or: [{ startUtc: { $lt: endUtc }, endUtc: { $gt: startUtc } }],
    });
    if (conflict) throw new ApiError(409, 'This time slot is no longer available', 'SLOT_UNAVAILABLE');

    // Create booking
    const booking = await BookingModel.create({
      organizationId,
      meetingTypeId,
      meetingTypeName: meetingType.name,
      assigneeId,
      guestName:        input.guestName,
      guestEmail:       input.guestEmail,
      guestPhone:       input.guestPhone ?? '',
      guestTimezone:    guestTz,
      startUtc,
      endUtc,
      durationMinutes:  meetingType.durationMinutes,
      status:           policy?.requireConfirmation ? 'pending' : 'confirmed',
      location:         meetingType.location,
      videoLink:        meetingType.videoLink,
      notes:            input.notes ?? '',
      leadId:           input.leadId ?? null,
      confirmationCode: genConfirmationCode(),
      customFieldValues:input.customFieldValues ?? {},
    });

    const result = booking.toJSON() as unknown as IBooking;

    // Create calendar event (non-blocking)
    MeetingService.createExternalEvent(organizationId, result).catch(() => {});

    // Schedule reminders (non-blocking)
    ReminderService.scheduleForBooking(result).catch(() => {});

    // Log activity
    if (input.leadId) {
      ActivityService.log({
        organizationId,
        type:      'booking',
        title:     `${meetingType.name} booked with ${input.guestName}`,
        leadId:    input.leadId,
        metadata:  { bookingId: result.id, assigneeId, startUtc: startUtc.toISOString() },
      }).catch(() => {});
    }

    // Fire automation
    AutomationService.fire('booking_made', organizationId, input.leadId ?? undefined, {
      bookingId:    result.id,
      meetingType:  meetingType.name,
      assigneeId,
    });

    // Fire workflow engine
    WorkflowEngine.trigger('booking_created', organizationId, {
      bookingId:      result.id,
      meetingTypeName:meetingType.name,
      guestName:      result.guestName,
      guestEmail:     result.guestEmail,
      assigneeId,
      leadId:         input.leadId ?? null,
    });

    // Analytics
    BookingAnalyticsService.track({
      organizationId,
      eventType:      'booking_created',
      bookingId:      result.id,
      meetingTypeId,
      assigneeId,
      guestTimezone:  guestTz,
      durationMinutes:meetingType.durationMinutes,
      leadTimeHours:  Math.round((startUtc.getTime() - now.getTime()) / 3600_000),
    });

    return result;
  },

  async getById(organizationId: string, id: string): Promise<IBooking> {
    const doc = await BookingModel.findOne({ _id: id, organizationId });
    if (!doc) throw new ApiError(404, 'Booking not found', 'BOOKING_NOT_FOUND');
    return doc.toJSON() as unknown as IBooking;
  },

  async getByConfirmationCode(code: string): Promise<IBooking> {
    const doc = await BookingModel.findOne({ confirmationCode: code });
    if (!doc) throw new ApiError(404, 'Booking not found', 'BOOKING_NOT_FOUND');
    return doc.toJSON() as unknown as IBooking;
  },

  async list(organizationId: string, q: BookingQuery): Promise<PaginatedResult<IBooking>> {
    const page  = q.page  ?? 1;
    const limit = q.limit ?? 20;
    const skip  = (page - 1) * limit;
    const filter: Record<string, unknown> = { organizationId };
    if (q.status)       filter.status       = q.status;
    if (q.assigneeId)   filter.assigneeId   = q.assigneeId;
    if (q.meetingTypeId)filter.meetingTypeId= q.meetingTypeId;
    if (q.fromDate || q.toDate) {
      filter.startUtc = {};
      if (q.fromDate) (filter.startUtc as any).$gte = new Date(q.fromDate);
      if (q.toDate)   (filter.startUtc as any).$lte = new Date(q.toDate + 'T23:59:59Z');
    }
    const [docs, total] = await Promise.all([
      BookingModel.find(filter).sort({ startUtc: 1 }).skip(skip).limit(limit),
      BookingModel.countDocuments(filter),
    ]);
    return paginated(docs.map(d => d.toJSON() as unknown as IBooking), total, { page, limit, skip });
  },

  async reschedule(organizationId: string, id: string, input: RescheduleInput): Promise<IBooking> {
    const booking = await BookingModel.findOne({ _id: id, organizationId });
    if (!booking) throw new ApiError(404, 'Booking not found', 'BOOKING_NOT_FOUND');
    if (['cancelled','completed','no_show'].includes(booking.status)) {
      throw new ApiError(400, 'Cannot reschedule this booking', 'INVALID_STATUS');
    }

    const dur        = booking.durationMinutes * 60_000;
    const newEnd     = new Date(input.newStart.getTime() + dur);
    const now        = new Date();
    if (input.newStart < now) throw new ApiError(400, 'Cannot reschedule to a past time', 'PAST_SLOT');

    // Check no conflict for assignee at new time (excluding this booking)
    const conflict = await BookingModel.findOne({
      organizationId,
      assigneeId: booking.assigneeId,
      _id:        { $ne: id },
      status:     { $in: ['confirmed','rescheduled','pending'] },
      $or: [{ startUtc: { $lt: newEnd }, endUtc: { $gt: input.newStart } }],
    });
    if (conflict) throw new ApiError(409, 'New slot is not available', 'SLOT_UNAVAILABLE');

    booking.rescheduleHistory.push({
      from:        booking.startUtc,
      to:          input.newStart,
      reason:      input.reason ?? '',
      changedAt:   now,
      changedById: input.userId,
    } as any);

    booking.startUtc = input.newStart;
    booking.endUtc   = newEnd;
    booking.status   = 'rescheduled';
    await booking.save();

    // Update external calendar event
    MeetingService.updateExternalEvent(organizationId, booking.toJSON() as unknown as IBooking).catch(() => {});

    BookingAnalyticsService.track({ organizationId, eventType: 'booking_rescheduled', bookingId: id, meetingTypeId: booking.meetingTypeId, assigneeId: booking.assigneeId });

    return booking.toJSON() as unknown as IBooking;
  },

  async cancel(organizationId: string, id: string, reason?: string, userId?: string): Promise<IBooking> {
    const booking = await BookingModel.findOne({ _id: id, organizationId });
    if (!booking) throw new ApiError(404, 'Booking not found', 'BOOKING_NOT_FOUND');
    if (booking.status === 'cancelled') throw new ApiError(400, 'Already cancelled', 'ALREADY_CANCELLED');

    booking.status             = 'cancelled';
    booking.cancellationReason = reason ?? null;
    await booking.save();

    // Delete external calendar event
    MeetingService.deleteExternalEvent(organizationId, booking.toJSON() as unknown as IBooking).catch(() => {});

    BookingAnalyticsService.track({ organizationId, eventType: 'booking_cancelled', bookingId: id, meetingTypeId: booking.meetingTypeId, assigneeId: booking.assigneeId });
    AutomationService.fire('lead_lost', organizationId, booking.leadId ?? undefined, { trigger: 'booking_cancelled', bookingId: id });

    // Fire workflow engine
    WorkflowEngine.trigger('booking_cancelled', organizationId, {
      bookingId:  id,
      guestName:  booking.guestName,
      guestEmail: booking.guestEmail,
      reason:     reason ?? null,
    });

    return booking.toJSON() as unknown as IBooking;
  },

  async markNoShow(organizationId: string, id: string): Promise<IBooking> {
    const booking = await BookingModel.findOneAndUpdate(
      { _id: id, organizationId }, { status: 'no_show' }, { new: true }
    );
    if (!booking) throw new ApiError(404, 'Booking not found', 'BOOKING_NOT_FOUND');
    BookingAnalyticsService.track({ organizationId, eventType: 'booking_no_show', bookingId: id, meetingTypeId: booking.meetingTypeId, assigneeId: booking.assigneeId });
    return booking.toJSON() as unknown as IBooking;
  },

  async confirm(organizationId: string, id: string): Promise<IBooking> {
    const booking = await BookingModel.findOneAndUpdate(
      { _id: id, organizationId, status: 'pending' },
      { status: 'confirmed' },
      { new: true }
    );
    if (!booking) throw new ApiError(404, 'Booking not found or not pending', 'BOOKING_NOT_FOUND');
    BookingAnalyticsService.track({ organizationId, eventType: 'booking_confirmed', bookingId: id, meetingTypeId: booking.meetingTypeId, assigneeId: booking.assigneeId });
    return booking.toJSON() as unknown as IBooking;
  },
};
