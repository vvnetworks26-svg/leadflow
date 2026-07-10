/**
 * RevenueDashboardService.ts — Revenue, pipeline value, and forecast metrics.
 * Billing models (Invoice, Subscription) are placeholders — hooks ready.
 */

import { LeadModel }    from '../../models/Lead.model';
import { BookingModel } from '../../models/Booking.model';
import { cached, TTL }  from '../cache/DashboardCache';

export interface RevenueMetrics {
  mrr:                number;   // Monthly Recurring Revenue (placeholder — from subscriptions)
  arr:                number;   // ARR = MRR * 12
  revenueThisMonth:   number;   // Closed Won value this month
  revenueLastMonth:   number;
  revenueGrowthPct:   number;
  revenueForecast:    number;   // probability-weighted pipeline
  pipelineValue:      number;
  avgDealSize:        number;
  totalInvoiced:      number;   // placeholder
  outstandingBalance: number;   // placeholder
  dealsWonThisMonth:  number;
  churnCount:         number;   // placeholder
  ltv:                number;   // placeholder
  revenueByMonth:     Array<{ month: string; revenue: number; deals: number }>;
  topDeals:           Array<{ leadId: string; name: string; value: number; stage: string }>;
}

export const RevenueDashboardService = {

  async get(organizationId: string): Promise<RevenueMetrics> {
    return cached(organizationId, 'revenue_dash', TTL.MEDIUM, async () => {
      const now        = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMoStart= new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMoEnd  = monthStart;
      const yearAgo    = new Date(now.getTime() - 365 * 86400_000);

      const [thisMonthAgg, lastMonthAgg, pipelineAgg, monthlyAgg, topDeals] = await Promise.all([
        LeadModel.aggregate([
          { $match: { organizationId, status: 'Closed Won', updatedAt: { $gte: monthStart } } },
          { $group: { _id: null, total: { $sum: '$value' }, count: { $sum: 1 } } },
        ]),
        LeadModel.aggregate([
          { $match: { organizationId, status: 'Closed Won', updatedAt: { $gte: lastMoStart, $lt: lastMoEnd } } },
          { $group: { _id: null, total: { $sum: '$value' } } },
        ]),
        LeadModel.aggregate([
          { $match: { organizationId, status: { $nin: ['Closed Won','Closed Lost'] }, estimatedValue: { $gt: 0 } } },
          { $group: { _id: null, total: { $sum: '$estimatedValue' } } },
        ]),
        LeadModel.aggregate([
          { $match: { organizationId, status: 'Closed Won', updatedAt: { $gte: yearAgo } } },
          { $group: {
            _id:     { $dateToString: { format: '%Y-%m', date: '$updatedAt' } },
            revenue: { $sum: '$value' }, deals: { $sum: 1 },
          }},
          { $sort: { _id: 1 } },
        ]),
        LeadModel.find({ organizationId, status: { $nin: ['Closed Won','Closed Lost'] }, estimatedValue: { $gt: 0 } })
          .sort({ estimatedValue: -1 }).limit(5)
          .select('name value estimatedValue stageName').lean(),
      ]);

      const thisMonth    = thisMonthAgg[0]?.total ?? 0;
      const lastMonth    = lastMonthAgg[0]?.total ?? 0;
      const pipeline     = pipelineAgg[0]?.total ?? 0;
      const growthPct    = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : 0;
      const wonThisMonth = thisMonthAgg[0]?.count ?? 0;

      // Rough MRR estimate from bookings (placeholder — replace with real billing data)
      const bookingRevenue = await BookingModel.aggregate([
        { $match: { organizationId, status: 'completed', startUtc: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: '$durationMinutes' } } },
      ]);
      const mrr = Math.round((bookingRevenue[0]?.total ?? 0) * 2); // $2/min placeholder rate

      return {
        mrr,
        arr:                mrr * 12,
        revenueThisMonth:   Math.round(thisMonth),
        revenueLastMonth:   Math.round(lastMonth),
        revenueGrowthPct:   growthPct,
        revenueForecast:    Math.round(pipeline * 0.6),  // simplified forecast
        pipelineValue:      Math.round(pipeline),
        avgDealSize:        wonThisMonth > 0 ? Math.round(thisMonth / wonThisMonth) : 0,
        totalInvoiced:      0,    // billing module placeholder
        outstandingBalance: 0,    // billing module placeholder
        dealsWonThisMonth:  wonThisMonth,
        churnCount:         0,    // billing module placeholder
        ltv:                0,    // billing module placeholder
        revenueByMonth:     monthlyAgg.map((r: any) => ({ month: r._id, revenue: r.revenue, deals: r.deals })),
        topDeals:           topDeals.map((d: any) => ({
          leadId: d._id.toString(), name: d.name, value: d.estimatedValue ?? d.value, stage: d.stageName ?? 'Unknown',
        })),
      };
    });
  },
};
