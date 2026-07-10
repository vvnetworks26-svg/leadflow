/**
 * InsightsService.ts
 *
 * AI-generated executive insights. Analyses aggregated metrics and generates
 * actionable recommendations using the Gemini engine (falls back to rule-based).
 */

import { sendToGemini, isGeminiConfigured } from '../../ai/gemini';
import { OverviewService }     from '../overview/OverviewService';
import { SalesDashboardService } from '../sales/SalesDashboardService';
import { CrmDashboardService } from '../crm/CrmDashboardService';
import { cached, TTL }         from '../cache/DashboardCache';

export interface ExecutiveInsight {
  id:        string;
  category:  'revenue' | 'sales' | 'crm' | 'ai' | 'bookings' | 'workflow' | 'widget' | 'general';
  title:     string;
  summary:   string;
  action:    string;
  priority:  'high' | 'medium' | 'low';
  metric?:   string;
}

export const InsightsService = {

  async generate(organizationId: string): Promise<ExecutiveInsight[]> {
    return cached(organizationId, 'insights', TTL.LONG, async () => {
      // Gather metrics concurrently
      const [overview, sales, crm] = await Promise.all([
        OverviewService.get(organizationId),
        SalesDashboardService.get(organizationId),
        CrmDashboardService.get(organizationId),
      ]);

      const metricsSnapshot = {
        conversionRate:    overview.conversionRate,
        pipelineValue:     overview.pipelineValue,
        tasksDue:          overview.tasksDue,
        winRate:           sales.winRate,
        avgDealSize:       sales.avgDealSize,
        avgLeadScore:      crm.avgLeadScore,
        duplicateLeads:    crm.duplicateLeads,
        taskCompletionRate:crm.taskCompletion.completionRate,
        overdueTaskCount:  crm.taskCompletion.overdue,
      };

      if (isGeminiConfigured()) {
        return InsightsService._aiInsights(metricsSnapshot);
      }
      return InsightsService._ruleBasedInsights(metricsSnapshot);
    });
  },

  async _aiInsights(metrics: Record<string, number>): Promise<ExecutiveInsight[]> {
    const prompt = `You are a business intelligence analyst. Based on these metrics:
${JSON.stringify(metrics, null, 2)}

Generate 5 concise executive insights in JSON array format. Each insight must have:
- id (string), category (one of: revenue|sales|crm|ai|bookings|workflow|widget|general)
- title (max 60 chars), summary (max 150 chars), action (specific next step, max 100 chars)
- priority (high|medium|low), metric (the metric this insight is based on)

Return only valid JSON array. No markdown.`;

    const response = await sendToGemini({
      systemPrompt:   'You are a BI analyst returning only JSON.',
      knowledgeBlock: '',
      history:        [],
      userMessage:    prompt,
      maxTokens:      800,
    });

    if (!response.success || !response.text) {
      return InsightsService._ruleBasedInsights(metrics);
    }

    try {
      const parsed = JSON.parse(response.text.replace(/```json\n?|\n?```/g, '').trim());
      if (Array.isArray(parsed)) return parsed as ExecutiveInsight[];
    } catch { /* fall through */ }

    return InsightsService._ruleBasedInsights(metrics);
  },

  _ruleBasedInsights(m: Record<string, number>): ExecutiveInsight[] {
    const insights: ExecutiveInsight[] = [];
    let id = 0;
    const nextId = () => String(++id);

    if (m.conversionRate < 10) insights.push({ id: nextId(), category: 'sales', priority: 'high',
      title: 'Low Lead Conversion Rate', metric: `${m.conversionRate}%`,
      summary: `Your conversion rate of ${m.conversionRate}% is below the 10% benchmark. Qualification criteria may need review.`,
      action: 'Review disqualified leads — add follow-up task for top 10 cold leads.' });

    if (m.overdueTaskCount > 5) insights.push({ id: nextId(), category: 'crm', priority: 'high',
      title: `${m.overdueTaskCount} Overdue Tasks`, metric: String(m.overdueTaskCount),
      summary: `${m.overdueTaskCount} tasks are overdue. This may indicate under-staffing or poor prioritization.`,
      action: 'Assign overdue tasks to available team members or reschedule.' });

    if (m.duplicateLeads > 10) insights.push({ id: nextId(), category: 'crm', priority: 'medium',
      title: 'Duplicate Leads Detected', metric: String(m.duplicateLeads),
      summary: `${m.duplicateLeads} duplicate lead records are affecting reporting accuracy.`,
      action: 'Run duplicate merge from CRM → Duplicates to clean your database.' });

    if (m.winRate < 20) insights.push({ id: nextId(), category: 'sales', priority: 'medium',
      title: 'Win Rate Below Target', metric: `${m.winRate}%`,
      summary: `Win rate of ${m.winRate}% is below the 20% target. Review lost deal reasons.`,
      action: 'Analyze lost reason field across Closed Lost leads this month.' });

    if (m.pipelineValue > 0 && m.avgDealSize > 0) insights.push({ id: nextId(), category: 'revenue', priority: 'low',
      title: 'Pipeline Health Overview', metric: `$${m.pipelineValue.toLocaleString()}`,
      summary: `Pipeline value is $${m.pipelineValue.toLocaleString()} with average deal size $${m.avgDealSize.toLocaleString()}.`,
      action: 'Focus on top 5 deals by value to maximize this month\'s revenue.' });

    // Always include at least 3 insights
    while (insights.length < 3) {
      insights.push({ id: nextId(), category: 'general', priority: 'low',
        title: 'Keep Up the Good Work',
        summary: 'Your metrics look healthy. Continue monitoring daily.',
        action: 'Review the full dashboard for detailed breakdowns.' });
    }

    return insights.slice(0, 7);
  },
};
