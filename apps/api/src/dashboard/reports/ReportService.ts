/**
 * ReportService.ts
 *
 * Generates structured report data for daily/weekly/monthly/quarterly/custom.
 * Exports to JSON (CSV/PDF/Excel are format hooks — transform the JSON payload).
 */

import { OverviewService }      from '../overview/OverviewService';
import { SalesDashboardService }from '../sales/SalesDashboardService';
import { CrmDashboardService }  from '../crm/CrmDashboardService';
import { BookingDashboardService } from '../bookings/BookingDashboardService';
import { RevenueDashboardService } from '../revenue/RevenueDashboardService';
import { InsightsService }      from '../insights/InsightsService';

export type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'custom';
export type ReportFormat  = 'json' | 'csv' | 'excel' | 'pdf';

export interface ReportRequest {
  organizationId: string;
  period:         ReportPeriod;
  fromDate?:      Date;
  toDate?:        Date;
  sections:       string[];   // which sections to include
}

export interface ReportData {
  metadata:   { organizationId: string; period: string; fromDate: string; toDate: string; generatedAt: string };
  overview?:  Record<string, unknown>;
  sales?:     Record<string, unknown>;
  crm?:       Record<string, unknown>;
  bookings?:  Record<string, unknown>;
  revenue?:   Record<string, unknown>;
  insights?:  unknown[];
}

function getPeriodDates(period: ReportPeriod, fromDate?: Date, toDate?: Date): { from: Date; to: Date } {
  const now = new Date();
  switch (period) {
    case 'daily':     return { from: new Date(now.setHours(0,0,0,0)),   to: new Date() };
    case 'weekly':    return { from: new Date(Date.now() - 7  * 86400_000), to: new Date() };
    case 'monthly':   return { from: new Date(Date.now() - 30 * 86400_000), to: new Date() };
    case 'quarterly': return { from: new Date(Date.now() - 90 * 86400_000), to: new Date() };
    case 'custom':    return { from: fromDate ?? new Date(Date.now() - 30 * 86400_000), to: toDate ?? new Date() };
    default:          return { from: new Date(Date.now() - 30 * 86400_000), to: new Date() };
  }
}

export const ReportService = {

  async generate(req: ReportRequest): Promise<ReportData> {
    const { organizationId, period, fromDate, toDate, sections } = req;
    const { from, to } = getPeriodDates(period, fromDate, toDate);

    const all = sections.includes('all');
    const wants = (s: string) => all || sections.includes(s);

    const [overview, sales, crm, bookings, revenue, insights] = await Promise.all([
      wants('overview')  ? OverviewService.get(organizationId).catch(() => null) : Promise.resolve(null),
      wants('sales')     ? SalesDashboardService.get(organizationId, from).catch(() => null) : Promise.resolve(null),
      wants('crm')       ? CrmDashboardService.get(organizationId).catch(() => null) : Promise.resolve(null),
      wants('bookings')  ? BookingDashboardService.get(organizationId).catch(() => null) : Promise.resolve(null),
      wants('revenue')   ? RevenueDashboardService.get(organizationId).catch(() => null) : Promise.resolve(null),
      wants('insights')  ? InsightsService.generate(organizationId).catch(() => []) : Promise.resolve(null),
    ]);

    const report: ReportData = {
      metadata: {
        organizationId,
        period,
        fromDate:    from.toISOString(),
        toDate:      to.toISOString(),
        generatedAt: new Date().toISOString(),
      },
    };

    if (overview)  report.overview  = overview  as any;
    if (sales)     report.sales     = sales     as any;
    if (crm)       report.crm       = crm       as any;
    if (bookings)  report.bookings  = bookings  as any;
    if (revenue)   report.revenue   = revenue   as any;
    if (insights)  report.insights  = insights  as any;

    return report;
  },

  /** Convert report data to CSV string (flat key=value per section). */
  toCsv(report: ReportData): string {
    const rows: string[] = ['section,metric,value'];
    for (const [section, data] of Object.entries(report)) {
      if (section === 'metadata' || !data) continue;
      for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
        if (typeof val !== 'object') {
          rows.push(`${section},"${key}","${val}"`);
        }
      }
    }
    return rows.join('\n');
  },
};
