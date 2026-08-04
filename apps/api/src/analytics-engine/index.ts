/**
 * analytics-engine/index.ts — Layer 10 public API
 */

export { AnalyticsEngine }          from './AnalyticsEngine';
export { AnalyticsCoordinator }     from './AnalyticsCoordinator';
export { EventProcessor }           from './EventProcessor';
export { EventAggregator }          from './EventAggregator';
export { MetricsCalculator }        from './MetricsCalculator';
export { ConversationMetricsCalculator } from './ConversationMetrics';
export { BookingMetricsCalculator } from './BookingMetrics';
export { IntentMetricsCalculator }  from './IntentMetrics';
export { ValidationMetricsCalculator } from './ValidationMetrics';
export { MemoryMetricsCalculator }  from './MemoryMetrics';
export { HandoffMetricsCalculator } from './HandoffMetrics';
export { FunnelAnalyzer }           from './FunnelAnalyzer';
export { DropoffAnalyzer }          from './DropoffAnalyzer';
export { PerformanceAnalyzer }      from './PerformanceAnalyzer';
export { DashboardSnapshotBuilder } from './DashboardSnapshot';
export { AnalyticsReportBuilder }   from './AnalyticsReport';

export type {
  AnalyticsEvent, AnalyticsEventType,
  ConversationMetrics, IntentMetrics, IntentMetricEntry,
  BookingMetrics, ValidationMetrics, MemoryMetrics,
  HandoffMetrics, FunnelMetrics, FunnelStage,
  PerformanceMetrics, LatencyBucket,
  PeriodSnapshot, DashboardSnapshot,
  AnalyticsReport, ReportPeriod, EventStore,
} from './types';
