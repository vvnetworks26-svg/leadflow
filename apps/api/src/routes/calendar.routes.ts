/**
 * calendar.routes.ts
 *
 * All calendar & scheduling endpoints — mounted at /api/v1/calendar.
 * Every route is organization-scoped via JWT middleware.
 */

import { Router } from 'express';
import { authenticate, authorize, requireOrganization } from '../middleware/authenticate';
import { ALL_ROLES, AGENT_AND_ABOVE, MANAGER_AND_ABOVE, OWNER_ADMIN, OWNER_ONLY } from '../config/permissions';
import {
  // Connections
  listConnections, getGoogleAuthUrl, googleOAuthCallback,
  getMicrosoftAuthUrl, microsoftOAuthCallback,
  disconnectCalendar, reconnectCalendar, syncCalendars, updateCalendarIds,
  // Meeting types
  listMeetingTypes, getMeetingType, createMeetingType,
  updateMeetingType, deleteMeetingType, toggleMeetingType,
  // Availability
  getAvailability, getNextSlot, getSuggestedSlots,
  // Bookings
  listBookings, getBooking, createBooking, rescheduleBooking,
  cancelBooking, confirmBooking, markNoShow, getBookingByCode,
  // Working hours
  getWorkingHours, upsertWorkingHours,
  // Holidays
  listHolidays, createHoliday, deleteHoliday,
  // Policy
  getPolicy, upsertPolicy,
  // Analytics
  getCalendarAnalytics,
} from '../controllers/calendarController';

const router = Router();

// ── OAuth (authenticate required so we know which org/user) ──────────────────
router.use(authenticate);
router.use(requireOrganization);

// ── Calendar Connections ──────────────────────────────────────────────────────
router.get('/connections',                     authorize(...ALL_ROLES),         listConnections);
router.get('/oauth/google/url',                authorize(...AGENT_AND_ABOVE),   getGoogleAuthUrl);
router.get('/oauth/google/callback',           authorize(...AGENT_AND_ABOVE),   googleOAuthCallback);
router.get('/oauth/microsoft/url',             authorize(...AGENT_AND_ABOVE),   getMicrosoftAuthUrl);
router.get('/oauth/microsoft/callback',        authorize(...AGENT_AND_ABOVE),   microsoftOAuthCallback);
router.delete('/connections/:id',              authorize(...AGENT_AND_ABOVE),   disconnectCalendar);
router.post('/connections/:id/reconnect',      authorize(...AGENT_AND_ABOVE),   reconnectCalendar);
router.post('/connections/:id/sync',           authorize(...AGENT_AND_ABOVE),   syncCalendars);
router.patch('/connections/:id/calendars',     authorize(...AGENT_AND_ABOVE),   updateCalendarIds);

// ── Meeting Types ─────────────────────────────────────────────────────────────
router.get('/meeting-types',                   authorize(...ALL_ROLES),         listMeetingTypes);
router.post('/meeting-types',                  authorize(...OWNER_ADMIN),       createMeetingType);
router.get('/meeting-types/:id',               authorize(...ALL_ROLES),         getMeetingType);
router.patch('/meeting-types/:id',             authorize(...OWNER_ADMIN),       updateMeetingType);
router.delete('/meeting-types/:id',            authorize(...OWNER_ADMIN),       deleteMeetingType);
router.patch('/meeting-types/:id/toggle',      authorize(...OWNER_ADMIN),       toggleMeetingType);

// ── Availability ──────────────────────────────────────────────────────────────
router.get('/availability',                    authorize(...ALL_ROLES),         getAvailability);
router.get('/availability/next',               authorize(...ALL_ROLES),         getNextSlot);
router.get('/availability/suggested',          authorize(...ALL_ROLES),         getSuggestedSlots);

// ── Bookings ──────────────────────────────────────────────────────────────────
router.get('/bookings',                        authorize(...ALL_ROLES),         listBookings);
router.post('/bookings',                       authorize(...AGENT_AND_ABOVE),   createBooking);
router.get('/bookings/code/:code',             authorize(...ALL_ROLES),         getBookingByCode);
router.get('/bookings/:id',                    authorize(...ALL_ROLES),         getBooking);
router.post('/bookings/:id/reschedule',        authorize(...AGENT_AND_ABOVE),   rescheduleBooking);
router.post('/bookings/:id/cancel',            authorize(...AGENT_AND_ABOVE),   cancelBooking);
router.post('/bookings/:id/confirm',           authorize(...MANAGER_AND_ABOVE), confirmBooking);
router.post('/bookings/:id/no-show',           authorize(...MANAGER_AND_ABOVE), markNoShow);

// ── Working Hours ─────────────────────────────────────────────────────────────
router.get('/working-hours',                   authorize(...ALL_ROLES),         getWorkingHours);
router.put('/working-hours',                   authorize(...AGENT_AND_ABOVE),   upsertWorkingHours);

// ── Holidays ──────────────────────────────────────────────────────────────────
router.get('/holidays',                        authorize(...ALL_ROLES),         listHolidays);
router.post('/holidays',                       authorize(...OWNER_ADMIN),       createHoliday);
router.delete('/holidays/:id',                 authorize(...OWNER_ADMIN),       deleteHoliday);

// ── Scheduling Policy ─────────────────────────────────────────────────────────
router.get('/policy',                          authorize(...ALL_ROLES),         getPolicy);
router.put('/policy',                          authorize(...OWNER_ADMIN),       upsertPolicy);

// ── Analytics ─────────────────────────────────────────────────────────────────
router.get('/analytics',                       authorize(...MANAGER_AND_ABOVE), getCalendarAnalytics);

export default router;
