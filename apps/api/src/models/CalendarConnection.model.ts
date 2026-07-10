/**
 * CalendarConnection.model.ts
 *
 * Stores OAuth credentials and state for a connected external calendar provider.
 * One document per provider per user per organization.
 * Access tokens are stored encrypted-at-rest (via MongoDB field-level security in production).
 * Never expose tokens in toJSON output.
 */

import { Schema, model, Document } from 'mongoose';

export type CalendarProviderType = 'google' | 'microsoft365' | 'outlook' | 'manual';
export type ConnectionStatus     = 'connected' | 'disconnected' | 'error' | 'expired';

export interface ICalendarConnection {
  id:               string;
  organizationId:   string;
  userId:           string;           // who connected it
  provider:         CalendarProviderType;
  status:           ConnectionStatus;
  providerAccountEmail: string;
  calendarIds:      string[];         // which calendars to read/write
  primaryCalendarId:string | null;
  accessToken:      string;           // OAuth access token (hidden in toJSON)
  refreshToken:     string;           // OAuth refresh token (hidden in toJSON)
  tokenExpiresAt:   Date | null;
  webhookChannelId: string | null;    // Google push channel id
  webhookExpiry:    Date | null;
  lastSyncAt:       Date | null;
  errorMessage:     string | null;
  createdAt:        Date;
  updatedAt:        Date;
}

export interface CalendarConnectionDocument extends Omit<ICalendarConnection, 'id'>, Document {}

const CalendarConnectionSchema = new Schema<CalendarConnectionDocument>(
  {
    organizationId:       { type: String, required: true, index: true },
    userId:               { type: String, required: true, index: true },
    provider:             { type: String, enum: ['google','microsoft365','outlook','manual'], required: true },
    status:               { type: String, enum: ['connected','disconnected','error','expired'], default: 'disconnected' },
    providerAccountEmail: { type: String, default: '' },
    calendarIds:          { type: [String], default: [] },
    primaryCalendarId:    { type: String, default: null },
    accessToken:          { type: String, default: '', select: false },
    refreshToken:         { type: String, default: '', select: false },
    tokenExpiresAt:       { type: Date, default: null },
    webhookChannelId:     { type: String, default: null },
    webhookExpiry:        { type: Date, default: null },
    lastSyncAt:           { type: Date, default: null },
    errorMessage:         { type: String, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        delete (ret as any)._id;
        delete (ret as any).accessToken;
        delete (ret as any).refreshToken;
        return ret;
      },
    },
  }
);

CalendarConnectionSchema.index({ organizationId: 1, userId: 1, provider: 1 }, { unique: true });
CalendarConnectionSchema.index({ organizationId: 1, status: 1 });

export const CalendarConnectionModel = model<CalendarConnectionDocument>('CalendarConnection', CalendarConnectionSchema);
