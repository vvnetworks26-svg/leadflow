/**
 * ICalendarProvider.ts
 *
 * Provider abstraction interface.
 * All calendar providers implement this interface.
 * Business logic never touches provider SDKs directly.
 */

export interface ExternalEvent {
  id:           string;
  title:        string;
  startUtc:     Date;
  endUtc:       Date;
  allDay:       boolean;
  location:     string;
  attendees:    string[];
  meetingLink:  string;
  recurrence:   string | null;
  status:       'confirmed' | 'tentative' | 'cancelled';
}

export interface CreateEventInput {
  title:       string;
  description: string;
  startUtc:    Date;
  endUtc:      Date;
  location:    string;
  attendees:   string[];
  meetingLink: string;
  reminderMinutes: number[];
  recurrence?: string;             // iCal RRULE string
}

export interface UpdateEventInput extends Partial<CreateEventInput> {
  eventId: string;
}

export interface CalendarList {
  id:      string;
  name:    string;
  primary: boolean;
  color:   string;
}

export interface BusyInterval {
  startUtc: Date;
  endUtc:   Date;
  source:   string;   // calendar id
}

export interface ICalendarProvider {
  readonly name: string;

  /** Check if the provider connection is valid / tokens are fresh. */
  isConnected(): Promise<boolean>;

  /** Refresh access token if needed. */
  refreshTokenIfNeeded(): Promise<void>;

  /** List available calendars for this connection. */
  listCalendars(): Promise<CalendarList[]>;

  /** Get busy intervals for a date range across specified calendars. */
  getBusyIntervals(
    calendarIds: string[],
    startUtc:    Date,
    endUtc:      Date,
  ): Promise<BusyInterval[]>;

  /** Create a calendar event and return the external event id. */
  createEvent(calendarId: string, input: CreateEventInput): Promise<string>;

  /** Update an existing calendar event. */
  updateEvent(calendarId: string, input: UpdateEventInput): Promise<void>;

  /** Delete a calendar event. */
  deleteEvent(calendarId: string, eventId: string): Promise<void>;

  /** Register a push-notification webhook (optional — providers may not support). */
  watchCalendar?(calendarId: string, webhookUrl: string): Promise<{ channelId: string; expiry: Date }>;

  /** Stop a webhook watch. */
  unwatchCalendar?(channelId: string): Promise<void>;
}
