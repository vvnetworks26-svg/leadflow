/**
 * Microsoft365Provider.ts
 *
 * Microsoft 365 / Outlook Calendar integration via Microsoft Graph API.
 * Uses @microsoft/microsoft-graph-client with a custom auth provider.
 */

import { Client } from '@microsoft/microsoft-graph-client';
import type {
  ICalendarProvider, CreateEventInput, UpdateEventInput,
  CalendarList, BusyInterval,
} from './ICalendarProvider';
import { logger } from '../../utils/logger';
import { env }    from '../../config/env';

interface MSTokens {
  accessToken:  string;
  refreshToken: string;
  tokenExpiry:  Date | null;
}

/**
 * Simple token refresh using the OAuth2 client credentials flow.
 * In production this would call the Microsoft identity platform token endpoint.
 */
async function refreshMSToken(refreshToken: string): Promise<{ accessToken: string; expiry: Date }> {
  const params = new URLSearchParams({
    client_id:     env.MS_CLIENT_ID     ?? '',
    client_secret: env.MS_CLIENT_SECRET ?? '',
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
    scope:         'https://graph.microsoft.com/Calendars.ReadWrite offline_access',
  });

  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    params.toString(),
  });

  if (!res.ok) throw new Error(`MS token refresh failed: ${res.status}`);
  const json = await res.json() as any;
  return {
    accessToken: json.access_token,
    expiry:      new Date(Date.now() + (json.expires_in ?? 3600) * 1000),
  };
}

export class Microsoft365Provider implements ICalendarProvider {
  readonly name = 'microsoft365';
  private tokens: MSTokens;
  private client!: Client;

  constructor(tokens: MSTokens) {
    this.tokens = tokens;
    this.initClient();
  }

  private initClient(): void {
    this.client = Client.initWithMiddleware({
      authProvider: {
        getAccessToken: async () => {
          await this.refreshTokenIfNeeded();
          return this.tokens.accessToken;
        },
      },
    });
  }

  async isConnected(): Promise<boolean> {
    try {
      await this.client.api('/me').select('id').get();
      return true;
    } catch { return false; }
  }

  async refreshTokenIfNeeded(): Promise<void> {
    const expiry = this.tokens.tokenExpiry;
    if (!expiry || expiry.getTime() - Date.now() < 5 * 60_000) {
      try {
        const { accessToken, expiry: newExpiry } = await refreshMSToken(this.tokens.refreshToken);
        this.tokens.accessToken  = accessToken;
        this.tokens.tokenExpiry  = newExpiry;
      } catch (err) {
        logger.warn({ err }, '[Microsoft365] Token refresh failed');
        throw err;
      }
    }
  }

  async listCalendars(): Promise<CalendarList[]> {
    const res = await this.client.api('/me/calendars').select('id,name,color,isDefaultCalendar').get();
    return (res.value ?? []).map((c: any) => ({
      id:      c.id,
      name:    c.name,
      primary: c.isDefaultCalendar ?? false,
      color:   c.hexColor ?? '#6366f1',
    }));
  }

  async getBusyIntervals(calendarIds: string[], startUtc: Date, endUtc: Date): Promise<BusyInterval[]> {
    const body = {
      schedules:        calendarIds,
      startTime:        { dateTime: startUtc.toISOString(), timeZone: 'UTC' },
      endTime:          { dateTime: endUtc.toISOString(),   timeZone: 'UTC' },
      availabilityViewInterval: 30,
    };
    const res = await this.client.api('/me/calendar/getSchedule').post(body);
    const intervals: BusyInterval[] = [];
    for (const sched of res.value ?? []) {
      for (const item of sched.scheduleItems ?? []) {
        if (item.status !== 'free') {
          intervals.push({
            startUtc: new Date(item.start.dateTime + 'Z'),
            endUtc:   new Date(item.end.dateTime   + 'Z'),
            source:   sched.scheduleId,
          });
        }
      }
    }
    return intervals;
  }

  async createEvent(_calendarId: string, input: CreateEventInput): Promise<string> {
    const event = {
      subject:  input.title,
      body:     { contentType: 'text', content: input.description },
      start:    { dateTime: input.startUtc.toISOString(), timeZone: 'UTC' },
      end:      { dateTime: input.endUtc.toISOString(),   timeZone: 'UTC' },
      location: { displayName: input.location || input.meetingLink },
      attendees:input.attendees.map(email => ({
        emailAddress: { address: email }, type: 'required',
      })),
      isOnlineMeeting: !!input.meetingLink,
      onlineMeetingUrl:input.meetingLink || undefined,
    };
    const res = await this.client.api('/me/events').post(event);
    return res.id ?? '';
  }

  async updateEvent(_calendarId: string, input: UpdateEventInput): Promise<void> {
    const patch: Record<string, unknown> = {};
    if (input.title)    patch.subject = input.title;
    if (input.startUtc) patch.start   = { dateTime: input.startUtc.toISOString(), timeZone: 'UTC' };
    if (input.endUtc)   patch.end     = { dateTime: input.endUtc.toISOString(),   timeZone: 'UTC' };
    if (input.location) patch.location = { displayName: input.location };
    await this.client.api(`/me/events/${input.eventId}`).patch(patch);
  }

  async deleteEvent(_calendarId: string, eventId: string): Promise<void> {
    await this.client.api(`/me/events/${eventId}`).delete().catch(() => {});
  }

  static getAuthUrl(redirectUri: string): string {
    const params = new URLSearchParams({
      client_id:     env.MS_CLIENT_ID ?? '',
      response_type: 'code',
      redirect_uri:  redirectUri,
      scope:         'https://graph.microsoft.com/Calendars.ReadWrite offline_access',
      response_mode: 'query',
    });
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
  }

  static async exchangeCode(code: string, redirectUri: string): Promise<{ accessToken: string; refreshToken: string; expiry: Date }> {
    const params = new URLSearchParams({
      client_id:     env.MS_CLIENT_ID     ?? '',
      client_secret: env.MS_CLIENT_SECRET ?? '',
      code,
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
      scope:         'https://graph.microsoft.com/Calendars.ReadWrite offline_access',
    });
    const res  = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:   params.toString(),
    });
    if (!res.ok) throw new Error(`MS token exchange failed: ${res.status}`);
    const json = await res.json() as any;
    return {
      accessToken:  json.access_token,
      refreshToken: json.refresh_token,
      expiry:       new Date(Date.now() + (json.expires_in ?? 3600) * 1000),
    };
  }
}
