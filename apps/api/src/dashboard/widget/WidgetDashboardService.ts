/**
 * WidgetDashboardService.ts — Widget engagement metrics.
 */

import { WidgetAnalyticsModel } from '../../models/WidgetAnalytics.model';
import { WidgetABTestModel }    from '../../models/WidgetABTest.model';
import { cached, TTL }         from '../cache/DashboardCache';

export interface WidgetDashMetrics {
  impressions:     number;
  opens:           number;
  messages:        number;
  ctr:             number;
  engagementRate:  number;
  bounceRate:      number;
  qualifiedLeads:  number;
  bookings:        number;
  dailyActivity:   Array<{ date: string; impressions: number; opens: number }>;
  abTestSummary:   Array<{ name: string; status: string; variants: number; winnerVariantId: string | null }>;
  deviceBreakdown: Array<{ device: string; count: number }>;
  topPages:        Array<{ url: string; impressions: number; opens: number }>;
}

export const WidgetDashboardService = {

  async get(organizationId: string): Promise<WidgetDashMetrics> {
    return cached(organizationId, 'widget_dash', TTL.SHORT, async () => {
      const monthAgo = new Date(Date.now() - 30 * 86400_000);

      const [countAgg, dailyAgg, deviceAgg, pageAgg, abTests] = await Promise.all([
        WidgetAnalyticsModel.aggregate([
          { $match: { organizationId, createdAt: { $gte: monthAgo } } },
          { $group: { _id: '$eventType', count: { $sum: 1 } } },
        ]),
        WidgetAnalyticsModel.aggregate([
          { $match: { organizationId, eventType: { $in: ['impression','open'] }, createdAt: { $gte: monthAgo } } },
          { $group: {
            _id:         { date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, type: '$eventType' },
            count:       { $sum: 1 },
          }},
          { $sort: { '_id.date': 1 } },
        ]),
        WidgetAnalyticsModel.aggregate([
          { $match: { organizationId, createdAt: { $gte: monthAgo } } },
          { $group: { _id: '$deviceType', count: { $sum: 1 } } },
        ]),
        WidgetAnalyticsModel.aggregate([
          { $match: { organizationId, eventType: { $in: ['impression','open'] }, createdAt: { $gte: monthAgo } } },
          { $group: {
            _id:         '$pageUrl',
            impressions: { $sum: { $cond: [{ $eq: ['$eventType','impression'] }, 1, 0] } },
            opens:       { $sum: { $cond: [{ $eq: ['$eventType','open'] }, 1, 0] } },
          }},
          { $sort: { impressions: -1 } }, { $limit: 10 },
        ]),
        WidgetABTestModel.find({ organizationId }).select('name status variants winnerVariantId').lean(),
      ]);

      const cm: Record<string, number> = {};
      for (const r of countAgg) cm[r._id] = r.count;
      const impressions = cm.impression     ?? 0;
      const opens       = cm.open           ?? 0;
      const messages    = cm.message_sent   ?? 0;
      const leads       = cm.lead_qualified ?? 0;
      const bookings    = cm.booking_created?? 0;
      const bounces     = cm.bounce         ?? 0;

      // Build daily map
      const dailyMap: Record<string, { impressions: number; opens: number }> = {};
      for (const r of dailyAgg) {
        const d = r._id.date;
        if (!dailyMap[d]) dailyMap[d] = { impressions: 0, opens: 0 };
        if (r._id.type === 'impression') dailyMap[d].impressions += r.count;
        if (r._id.type === 'open')       dailyMap[d].opens       += r.count;
      }

      return {
        impressions, opens, messages,
        ctr:             impressions > 0 ? Math.round((opens / impressions) * 100) : 0,
        engagementRate:  opens > 0       ? Math.round((messages / opens) * 100) : 0,
        bounceRate:      opens > 0       ? Math.round((bounces / opens) * 100) : 0,
        qualifiedLeads:  leads,
        bookings,
        dailyActivity:   Object.entries(dailyMap).map(([date, v]) => ({ date, ...v })),
        abTestSummary:   abTests.map((t: any) => ({
          name: t.name, status: t.status, variants: t.variants?.length ?? 0, winnerVariantId: t.winnerVariantId,
        })),
        deviceBreakdown: deviceAgg.map((r: any) => ({ device: r._id, count: r.count })),
        topPages:        pageAgg.map((r: any) => ({ url: r._id, impressions: r.impressions, opens: r.opens })),
      };
    });
  },
};
