/**
 * ai/analytics.ts
 *
 * AI analytics event tracking.
 * Events are fire-and-forget — failures never block the conversation.
 * Stored in MongoDB for dashboard reporting.
 */

import { Schema, model, Document } from 'mongoose';
import type { AIAnalyticsEvent, AIAnalyticsEventType } from './types';
import { logger } from '../utils/logger';

// ─── Mongoose model ───────────────────────────────────────────────────────────

export interface AIAnalyticsDocument extends Omit<AIAnalyticsEvent, 'timestamp'>, Document {
  createdAt: Date;
}

const AIAnalyticsSchema = new Schema<AIAnalyticsDocument>(
  {
    eventType:      { type: String, required: true, index: true },
    organizationId: { type: String, required: true, index: true },
    conversationId: { type: String, required: true, index: true },
    payload:        { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  }
);

AIAnalyticsSchema.index({ organizationId: 1, createdAt: -1 });
AIAnalyticsSchema.index({ organizationId: 1, eventType: 1 });
AIAnalyticsSchema.index({ conversationId: 1, createdAt: -1 });

export const AIAnalyticsModel = model<AIAnalyticsDocument>('AIAnalytics', AIAnalyticsSchema);

// ─── Event factory ────────────────────────────────────────────────────────────

export function makeEvent(
  eventType:      AIAnalyticsEventType,
  organizationId: string,
  conversationId: string,
  payload:        Record<string, unknown>,
): AIAnalyticsEvent {
  return {
    eventType,
    organizationId,
    conversationId,
    payload,
    timestamp: new Date().toISOString(),
  };
}

// ─── Persistence (fire-and-forget) ────────────────────────────────────────────

export function persistEvents(events: AIAnalyticsEvent[]): void {
  if (events.length === 0) return;
  AIAnalyticsModel
    .insertMany(events.map(e => ({
      eventType:      e.eventType,
      organizationId: e.organizationId,
      conversationId: e.conversationId,
      payload:        e.payload,
    })))
    .catch((err: unknown) => {
      logger.warn({ err }, '[AIAnalytics] Failed to persist events');
    });
}

// ─── Aggregated stats ─────────────────────────────────────────────────────────

export interface AIStats {
  intentDistribution:       Record<string, number>;
  averageLeadScore:         number;
  bookingRate:              number;
  averageConversationLength:number;
  toolUsage:                Record<string, number>;
  recommendationAcceptance: number;
  guardrailBlocks:          number;
  dropOffByStage:           Record<string, number>;
}

export async function getAIStats(
  organizationId: string,
  since?:         Date,
): Promise<AIStats> {
  const match: Record<string, unknown> = { organizationId };
  if (since) match.createdAt = { $gte: since };

  const events = await AIAnalyticsModel.find(match).lean();

  const intentCounts:  Record<string, number> = {};
  const toolCounts:    Record<string, number> = {};
  const stageCounts:   Record<string, number> = {};
  let   totalScore     = 0;
  let   scoreCount     = 0;
  let   bookings       = 0;
  let   conversations  = 0;
  let   totalLength    = 0;
  let   guards         = 0;
  let   recsShown      = 0;
  let   recsAccepted   = 0;

  for (const e of events) {
    switch (e.eventType) {
      case 'intent_classified': {
        const intent = String((e.payload as any).intent ?? 'Unknown');
        intentCounts[intent] = (intentCounts[intent] ?? 0) + 1;
        break;
      }
      case 'lead_qualified': {
        const score = Number((e.payload as any).score ?? 0);
        if (score > 0) { totalScore += score; scoreCount++; }
        break;
      }
      case 'booking_triggered':
        bookings++;
        break;
      case 'tool_called': {
        const tool = String((e.payload as any).tool ?? 'unknown');
        toolCounts[tool] = (toolCounts[tool] ?? 0) + 1;
        break;
      }
      case 'message_received': {
        conversations++;
        totalLength += Number((e.payload as any).turnCount ?? 1);
        break;
      }
      case 'guardrail_blocked':
        guards++;
        break;
      case 'recommendation_shown':
        recsShown++;
        break;
      case 'stage_transition': {
        const stage = String((e.payload as any).to ?? 'unknown');
        stageCounts[stage] = (stageCounts[stage] ?? 0) + 1;
        break;
      }
    }
  }

  const uniqueConvIds = new Set(events.map(e => e.conversationId)).size;

  return {
    intentDistribution:       intentCounts,
    averageLeadScore:         scoreCount > 0 ? Math.round(totalScore / scoreCount) : 0,
    bookingRate:              uniqueConvIds > 0 ? Math.round((bookings / uniqueConvIds) * 100) : 0,
    averageConversationLength:conversations > 0 ? Math.round(totalLength / conversations) : 0,
    toolUsage:                toolCounts,
    recommendationAcceptance: recsShown > 0 ? Math.round((recsAccepted / recsShown) * 100) : 0,
    guardrailBlocks:          guards,
    dropOffByStage:           stageCounts,
  };
}
