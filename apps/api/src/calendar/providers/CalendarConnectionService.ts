/**
 * CalendarConnectionService.ts
 *
 * Manages CalendarConnection records — OAuth flows, token updates,
 * calendar list sync, and reconnection.
 */

import { CalendarConnectionModel, ICalendarConnection, CalendarProviderType } from '../../models/CalendarConnection.model';
import { GoogleCalendarProvider }   from './GoogleCalendarProvider';
import { Microsoft365Provider }     from './Microsoft365Provider';
import { getProviderForConnection } from './ProviderFactory';
import { ApiError }                 from '../../middleware/errorHandler';
import { env }                      from '../../config/env';
import { logger }                   from '../../utils/logger';

export const CalendarConnectionService = {

  async list(organizationId: string, userId: string): Promise<ICalendarConnection[]> {
    const docs = await CalendarConnectionModel.find({ organizationId, userId });
    return docs.map(d => d.toJSON() as unknown as ICalendarConnection);
  },

  async getById(organizationId: string, id: string): Promise<ICalendarConnection> {
    const doc = await CalendarConnectionModel.findOne({ _id: id, organizationId });
    if (!doc) throw new ApiError(404, 'Calendar connection not found', 'CONNECTION_NOT_FOUND');
    return doc.toJSON() as unknown as ICalendarConnection;
  },

  /** Get Google OAuth2 authorization URL. */
  getGoogleAuthUrl(redirectUri: string): string {
    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'email',
    ];
    return GoogleCalendarProvider.getAuthUrl(
      env.GOOGLE_CLIENT_ID     ?? '',
      env.GOOGLE_CLIENT_SECRET ?? '',
      redirectUri,
      scopes,
    );
  },

  /** Handle Google OAuth callback — create/update connection. */
  async connectGoogle(
    organizationId: string,
    userId:         string,
    code:           string,
    redirectUri:    string,
  ): Promise<ICalendarConnection> {
    const tokens = await GoogleCalendarProvider.exchangeCode(
      env.GOOGLE_CLIENT_ID     ?? '',
      env.GOOGLE_CLIENT_SECRET ?? '',
      redirectUri,
      code,
    );

    // Get account email
    const tempProvider = new GoogleCalendarProvider({
      clientId:     env.GOOGLE_CLIENT_ID     ?? '',
      clientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
      accessToken:  tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiry:  tokens.expiry,
      redirectUri,
    });
    let email = '';
    let calendarIds: string[] = [];
    let primaryId:   string   = '';
    try {
      const cals   = await tempProvider.listCalendars();
      calendarIds  = cals.map(c => c.id);
      primaryId    = cals.find(c => c.primary)?.id ?? cals[0]?.id ?? '';
    } catch { /* continue without calendar list */ }

    const doc = await CalendarConnectionModel.findOneAndUpdate(
      { organizationId, userId, provider: 'google' },
      {
        status:               'connected',
        providerAccountEmail: email,
        calendarIds,
        primaryCalendarId:    primaryId,
        accessToken:          tokens.accessToken,
        refreshToken:         tokens.refreshToken,
        tokenExpiresAt:       tokens.expiry,
        errorMessage:         null,
        lastSyncAt:           new Date(),
      },
      { upsert: true, new: true }
    );
    return doc.toJSON() as unknown as ICalendarConnection;
  },

  /** Get Microsoft 365 OAuth authorization URL. */
  getMicrosoftAuthUrl(redirectUri: string): string {
    return Microsoft365Provider.getAuthUrl(redirectUri);
  },

  /** Handle Microsoft OAuth callback. */
  async connectMicrosoft(
    organizationId: string,
    userId:         string,
    code:           string,
    redirectUri:    string,
  ): Promise<ICalendarConnection> {
    const tokens = await Microsoft365Provider.exchangeCode(code, redirectUri);
    const doc    = await CalendarConnectionModel.findOneAndUpdate(
      { organizationId, userId, provider: 'microsoft365' },
      {
        status:            'connected',
        accessToken:       tokens.accessToken,
        refreshToken:      tokens.refreshToken,
        tokenExpiresAt:    tokens.expiry,
        errorMessage:      null,
        lastSyncAt:        new Date(),
      },
      { upsert: true, new: true }
    );
    return doc.toJSON() as unknown as ICalendarConnection;
  },

  /** Disconnect a calendar provider. */
  async disconnect(organizationId: string, id: string): Promise<void> {
    const doc = await CalendarConnectionModel.findOneAndUpdate(
      { _id: id, organizationId },
      { status: 'disconnected', accessToken: '', refreshToken: '' },
    );
    if (!doc) throw new ApiError(404, 'Connection not found', 'CONNECTION_NOT_FOUND');
  },

  /** Reconnect / re-test an existing connection. */
  async reconnect(organizationId: string, id: string): Promise<ICalendarConnection> {
    const provider = await getProviderForConnection(id);
    try {
      await provider.refreshTokenIfNeeded();
      const connected = await provider.isConnected();
      await CalendarConnectionModel.findByIdAndUpdate(id, {
        status:       connected ? 'connected' : 'error',
        errorMessage: connected ? null : 'Connection test failed',
        lastSyncAt:   new Date(),
      });
    } catch (err: any) {
      await CalendarConnectionModel.findByIdAndUpdate(id, {
        status:       'error',
        errorMessage: err?.message ?? 'Unknown error',
      });
      throw new ApiError(502, 'Calendar reconnection failed', 'RECONNECT_FAILED');
    }
    return CalendarConnectionService.getById(organizationId, id);
  },

  /** Sync calendar list for a connection. */
  async syncCalendars(organizationId: string, id: string): Promise<string[]> {
    const provider = await getProviderForConnection(id);
    const cals     = await provider.listCalendars();
    const calIds   = cals.map(c => c.id);
    const primary  = cals.find(c => c.primary)?.id ?? calIds[0] ?? '';
    await CalendarConnectionModel.findByIdAndUpdate(id, {
      calendarIds:       calIds,
      primaryCalendarId: primary,
      lastSyncAt:        new Date(),
    });
    return calIds;
  },

  /** Update which calendar IDs are active for a connection. */
  async updateCalendarIds(
    organizationId: string,
    id:             string,
    calendarIds:    string[],
    primaryId?:     string,
  ): Promise<ICalendarConnection> {
    const doc = await CalendarConnectionModel.findOneAndUpdate(
      { _id: id, organizationId },
      {
        calendarIds,
        primaryCalendarId: primaryId ?? calendarIds[0] ?? null,
      },
      { new: true }
    );
    if (!doc) throw new ApiError(404, 'Connection not found', 'CONNECTION_NOT_FOUND');
    return doc.toJSON() as unknown as ICalendarConnection;
  },
};
