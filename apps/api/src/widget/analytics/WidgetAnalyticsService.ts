/**
 * WidgetAnalyticsService.ts
 *
 * Tracks widget engagement events and provides aggregated stats.
 * All events are organization-scoped. TTL indexed (1 year).
 */

import { WidgetAnalyticsModel, WidgetEventType } from '../../models/WidgetAnalytics.model';
import { logger } from '../../utils/logger';

export interface TrackEventInput {
  organizationId: string;
  eventType:      WidgetEventType;
  sessionId:      string;
  variantId?:     string | null;
  pageUrl?:       string;
  referrer?:      string;
  deviceType?:    'desktop' | 'tablet' | 'mobile';
  locale?:        string;
  durationMs?:    number;
  metadata?:      Record<string, unknown>;
}

export interface WidgetStats {
  impressions:        number;
  opens:              number;
  messages:           number;
  qualifiedLeads:     number;
  bookings:           number;
  openRate:           number;   // opens/impressions %
  conversionRate:     number;   // leads/opens %
  bookingRate:        number;   // bookings/opens %
  averageSessionMs:   number;
  bounceRate:         number;
  byDevice:           Record<string, number>;
  byPage:             Array<{ url: string; count: number }>;
  byLocale:           Array<{ locale: string; count: number }>;
  dailyImpressions:   Array<{ date: string; count: number }>;
  variantPerformance: Array<{ variantId: string; impressions: number; opens: number; leads: number; bookings: number }>;
}

export const WidgetAnalyticsService = {

  track(input: TrackEventInput): void {
    WidgetAnalyticsModel.create({
      organizationId: input.organizationId,
      eventType:      input.eventType,
      sessionId:      input.sessionId,
      variantId:      input.variantId ?? null,
      pageUrl:        input.pageUrl    ?? '',
      referrer:       input.referrer   ?? '',
      deviceType:     input.deviceType ?? 'desktop',
      locale:         input.locale     ?? 'en',
      durationMs:     input.durationMs ?? null,
      metadata:       input.metadata   ?? {},
    }).catch((err: unknown) => {
      logger.warn({ err }, '[WidgetAnalytics] Failed to track event');
    });
  },

  async getStats(organizationId: string, since?: Date): Promise<WidgetStats> {
    const fromDate = since ?? new Date(Date.now() - 30 * 86400_000);

    const [
      countsByType,
      byDevice,
      byPage,
      byLocale,
      dailyImpressions,
      sessionDurations,
      variantStats,
    ] = await Promise.all([
      WidgetAnalyticsModel.aggregate([
        { $match: { organizationId, createdAt: { $gte: fromDate } } },
        { $group: { _id: '$eventType', count: { $sum: 1 } } },
      ]),
      WidgetAnalyticsModel.aggregate([
        { $match: { organizationId, createdAt: { $gte: fromDate } } },
        { $group: { _id: '$deviceType', count: { $sum: 1 } } },
      ]),
      WidgetAnalyticsModel.aggregate([
        { $match: { organizationId, eventType: 'impression', createdAt: { $gte: fromDate } } },
        { $group: { _id: '$pageUrl', count: { $sum: 1 } } },
        { $sort: { count: -1 } }, { $limit: 10 },
      ]),
      WidgetAnalyticsModel.aggregate([
        { $match: { organizationId, createdAt: { $gte: fromDate } } },
        { $group: { _id: '$locale', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      WidgetAnalyticsModel.aggregate([
        { $match: { organizationId, eventType: 'impression', createdAt: { $gte: fromDate } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }, { $limit: 30 },
      ]),
      WidgetAnalyticsModel.aggregate([
        { $match: { organizationId, eventType: 'session_end', durationMs: { $ne: null }, createdAt: { $gte: fromDate } } },
        { $group: { _id: null, avg: { $avg: '$durationMs' } } },
      ]),
      WidgetAnalyticsModel.aggregate([
        { $match: { organizationId, variantId: { $ne: null }, createdAt: { $gte: fromDate } } },
        { $group: {
          _id:         '$variantId',
          impressions: { $sum: { $cond: [{ $eq: ['$eventType','impression'] }, 1, 0] } },
          opens:       { $sum: { $cond: [{ $eq: ['$eventType','open'] }, 1, 0] } },
          leads:       { $sum: { $cond: [{ $eq: ['$eventType','lead_qualified'] }, 1, 0] } },
          bookings:    { $sum: { $cond: [{ $eq: ['$eventType','booking_created'] }, 1, 0] } },
        }},
      ]),
    ]);

    const cm: Record<string, number> = {};
    for (const r of countsByType) cm[r._id] = r.count;

    const impressions  = cm.impression        ?? 0;
    const opens        = cm.open              ?? 0;
    const messages     = cm.message_sent      ?? 0;
    const leads        = cm.lead_qualified    ?? 0;
    const bookings     = cm.booking_created   ?? 0;
    const bounces      = cm.bounce            ?? 0;

    return {
      impressions, opens, messages,
      qualifiedLeads:   leads,
      bookings,
      openRate:         impressions > 0 ? Math.round((opens / impressions) * 100) : 0,
      conversionRate:   opens > 0       ? Math.round((leads / opens) * 100) : 0,
      bookingRate:      opens > 0       ? Math.round((bookings / opens) * 100) : 0,
      averageSessionMs: Math.round(sessionDurations[0]?.avg ?? 0),
      bounceRate:       opens > 0       ? Math.round((bounces / opens) * 100) : 0,
      byDevice:         Object.fromEntries(byDevice.map((r: any) => [r._id, r.count])),
      byPage:           byPage.map((r: any) => ({ url: r._id, count: r.count })),
      byLocale:         byLocale.map((r: any) => ({ locale: r._id, count: r.count })),
      dailyImpressions: dailyImpressions.map((r: any) => ({ date: r._id, count: r.count })),
      variantPerformance: variantStats.map((r: any) => ({
        variantId: r._id, impressions: r.impressions, opens: r.opens, leads: r.leads, bookings: r.bookings,
      })),
    };
  },
};
