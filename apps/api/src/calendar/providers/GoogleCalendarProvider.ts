/**
 * GoogleCalendarProvider.ts
 *
 * Google Calendar integration via googleapis SDK.
 * Handles OAuth2 token refresh automatically before every API call.
 */

import { google, calendar_v3 } from 'googleapis';
import type {
  ICalendarProvider, ExternalEvent, CreateEventInput, UpdateEventInput,
  CalendarList, BusyInterval,
} from './ICalendarProvider';
import { logger } from '../../utils/logger';

export interface GoogleCredentials {
  clientId:     string;
  clientSecret: string;
  accessToken:  string;
  refreshToken: string;
  tokenExpiry:  Date | null;
  redirectUri:  string;
}

export class GoogleCalendarProvider implements ICalendarProvider {
  readonly name = 'google';

  private oauth2Client: InstanceType<typeof google.auth.OAuth2>;

  constructor(private creds: GoogleCredentials) {
    this.oauth2Client = new google.auth.OAuth2(
      creds.clientId,
      creds.clientSecret,
      creds.redirectUri,
    );
    this.oauth2Client.setCredentials({
      access_token:  creds.accessToken,
      refresh_token: creds.refreshToken,
      expiry_date:   creds.tokenExpiry?.getTime(),
    });
  }

  async isConnected(): Promise<boolean> {
    try {
      const cal = google.calendar({ version: 'v3', auth: this.oauth2Client });
      await cal.calendarList.list({ maxResults: 1 });
      return true;
    } catch {
      return false;
    }
  }

  async refreshTokenIfNeeded(): Promise<void> {
    const expiry = this.creds.tokenExpiry;
    if (!expiry || expiry.getTime() - Date.now() < 5 * 60_000) {
      try {
        const { credentials } = await this.oauth2Client.refreshAccessToken();
        this.oauth2Client.setCredentials(credentials);
        this.creds.accessToken = credentials.access_token ?? this.creds.accessToken;
        if (credentials.expiry_date) {
          this.creds.tokenExpiry = new Date(credentials.expiry_date);
        }
      } catch (err) {
        logger.warn({ err }, '[GoogleCalendar] Token refresh failed');
        throw err;
      }
    }
  }

  async listCalendars(): Promise<CalendarList[]> {
    await this.refreshTokenIfNeeded();
    const cal = google.calendar({ version: 'v3', auth: this.oauth2Client });
    const res = await cal.calendarList.list();
    return (res.data.items ?? []).map(c => ({
      id:      c.id ?? '',
      name:    c.summary ?? '',
      primary: c.primary ?? false,
      color:   c.backgroundColor ?? '#6366f1',
    }));
  }

  async getBusyIntervals(calendarIds: string[], startUtc: Date, endUtc: Date): Promise<BusyInterval[]> {
    await this.refreshTokenIfNeeded();
    const cal = google.calendar({ version: 'v3', auth: this.oauth2Client });
    const res = await cal.freebusy.query({
      requestBody: {
        timeMin:  startUtc.toISOString(),
        timeMax:  endUtc.toISOString(),
        items:    calendarIds.map(id => ({ id })),
      },
    });

    const intervals: BusyInterval[] = [];
    for (const [calId, data] of Object.entries(res.data.calendars ?? {})) {
      for (const busy of (data as any).busy ?? []) {
        intervals.push({
          startUtc: new Date(busy.start),
          endUtc:   new Date(busy.end),
          source:   calId,
        });
      }
    }
    return intervals;
  }

  async createEvent(calendarId: string, input: CreateEventInput): Promise<string> {
    await this.refreshTokenIfNeeded();
    const cal = google.calendar({ version: 'v3', auth: this.oauth2Client });

    const event: calendar_v3.Schema$Event = {
      summary:     input.title,
      description: input.description,
      location:    input.location || input.meetingLink,
      start:       { dateTime: input.startUtc.toISOString(), timeZone: 'UTC' },
      end:         { dateTime: input.endUtc.toISOString(),   timeZone: 'UTC' },
      attendees:   input.attendees.map(email => ({ email })),
      conferenceData: input.meetingLink ? {
        createRequest: { requestId: `lf-${Date.now()}` },
      } : undefined,
      reminders: {
        useDefault: false,
        overrides:  input.reminderMinutes.map(m => ({ method: 'email', minutes: m })),
      },
      recurrence: input.recurrence ? [input.recurrence] : undefined,
    };

    const res = await cal.events.insert({
      calendarId,
      requestBody:       event,
      conferenceDataVersion: input.meetingLink ? 1 : 0,
    });
    return res.data.id ?? '';
  }

  async updateEvent(calendarId: string, input: UpdateEventInput): Promise<void> {
    await this.refreshTokenIfNeeded();
    const cal = google.calendar({ version: 'v3', auth: this.oauth2Client });
    const patch: calendar_v3.Schema$Event = {};
    if (input.title)       patch.summary     = input.title;
    if (input.description) patch.description = input.description;
    if (input.startUtc)    patch.start       = { dateTime: input.startUtc.toISOString(), timeZone: 'UTC' };
    if (input.endUtc)      patch.end         = { dateTime: input.endUtc.toISOString(),   timeZone: 'UTC' };
    if (input.location)    patch.location    = input.location;
    await cal.events.patch({ calendarId, eventId: input.eventId, requestBody: patch });
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    await this.refreshTokenIfNeeded();
    const cal = google.calendar({ version: 'v3', auth: this.oauth2Client });
    await cal.events.delete({ calendarId, eventId }).catch(() => {});
  }

  async watchCalendar(calendarId: string, webhookUrl: string): Promise<{ channelId: string; expiry: Date }> {
    await this.refreshTokenIfNeeded();
    const cal = google.calendar({ version: 'v3', auth: this.oauth2Client });
    const channelId = `lf-${Date.now()}`;
    const res = await cal.events.watch({
      calendarId,
      requestBody: {
        id:      channelId,
        type:    'web_hook',
        address: webhookUrl,
        expiration: String(Date.now() + 7 * 24 * 3600_000),
      },
    });
    return {
      channelId: res.data.id ?? channelId,
      expiry:    new Date(Number(res.data.expiration ?? Date.now() + 7 * 24 * 3600_000)),
    };
  }

  async unwatchCalendar(channelId: string): Promise<void> {
    // Google requires the resourceId too — best effort
    logger.info({ channelId }, '[GoogleCalendar] Unwatch (best-effort)');
  }

  /** Generate the OAuth2 authorization URL for a user to connect. */
  static getAuthUrl(clientId: string, clientSecret: string, redirectUri: string, scopes: string[]): string {
    const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    return client.generateAuthUrl({ access_type: 'offline', scope: scopes, prompt: 'consent' });
  }

  /** Exchange authorization code for tokens. */
  static async exchangeCode(
    clientId: string, clientSecret: string, redirectUri: string, code: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiry: Date }> {
    const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const { tokens } = await client.getToken(code);
    return {
      accessToken:  tokens.access_token ?? '',
      refreshToken: tokens.refresh_token ?? '',
      expiry:       new Date(tokens.expiry_date ?? Date.now() + 3600_000),
    };
  }
}
