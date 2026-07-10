/**
 * ProviderFactory.ts
 *
 * Instantiates the correct ICalendarProvider for a CalendarConnection.
 * New providers plug in here without touching any business logic.
 */

import { CalendarConnectionModel } from '../../models/CalendarConnection.model';
import { GoogleCalendarProvider }  from './GoogleCalendarProvider';
import { Microsoft365Provider }    from './Microsoft365Provider';
import { ManualProvider }          from './ManualProvider';
import type { ICalendarProvider }  from './ICalendarProvider';
import { env } from '../../config/env';

export async function getProviderForUser(
  organizationId: string,
  userId:         string,
): Promise<ICalendarProvider> {
  const conn = await CalendarConnectionModel
    .findOne({ organizationId, userId, status: 'connected' })
    .select('+accessToken +refreshToken')
    .lean();

  if (!conn) return new ManualProvider(organizationId, userId);

  switch (conn.provider) {
    case 'google':
      return new GoogleCalendarProvider({
        clientId:     env.GOOGLE_CLIENT_ID     ?? '',
        clientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
        accessToken:  conn.accessToken,
        refreshToken: conn.refreshToken,
        tokenExpiry:  conn.tokenExpiresAt,
        redirectUri:  env.GOOGLE_REDIRECT_URI  ?? '',
      });

    case 'microsoft365':
    case 'outlook':
      return new Microsoft365Provider({
        accessToken:  conn.accessToken,
        refreshToken: conn.refreshToken,
        tokenExpiry:  conn.tokenExpiresAt,
      });

    default:
      return new ManualProvider(organizationId, userId);
  }
}

export async function getProviderForConnection(connectionId: string): Promise<ICalendarProvider> {
  const conn = await CalendarConnectionModel
    .findById(connectionId)
    .select('+accessToken +refreshToken')
    .lean();

  if (!conn) return new ManualProvider('', '');

  switch (conn.provider) {
    case 'google':
      return new GoogleCalendarProvider({
        clientId:     env.GOOGLE_CLIENT_ID     ?? '',
        clientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
        accessToken:  conn.accessToken,
        refreshToken: conn.refreshToken,
        tokenExpiry:  conn.tokenExpiresAt,
        redirectUri:  env.GOOGLE_REDIRECT_URI  ?? '',
      });
    case 'microsoft365':
    case 'outlook':
      return new Microsoft365Provider({
        accessToken:  conn.accessToken,
        refreshToken: conn.refreshToken,
        tokenExpiry:  conn.tokenExpiresAt,
      });
    default:
      return new ManualProvider(conn.organizationId, conn.userId);
  }
}
