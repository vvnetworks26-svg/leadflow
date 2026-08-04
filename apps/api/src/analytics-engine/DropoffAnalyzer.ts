/**
 * analytics-engine/DropoffAnalyzer.ts
 * Where users abandon conversations. PURE.
 */

import type { ConversationStage } from '../ai/types';
import type { AnalyticsEvent as AE } from './types';
import { MetricsCalculator } from './MetricsCalculator';

export interface DropoffReport {
  readonly byStage:       Readonly<Partial<Record<ConversationStage | 'unknown', number>>>;
  readonly topDropoffStage: ConversationStage | 'unknown' | null;
  readonly beforeIntent:  number;   // abandoned before intent detected
  readonly duringBooking: number;   // abandoned during booking
}

export const DropoffAnalyzer = {

  analyze(events: readonly AE[]): DropoffReport {
    const lastStage: Record<string, ConversationStage | 'unknown'> = {};
    const hadIntent: Set<string> = new Set();
    const inBooking: Set<string> = new Set();

    for (const e of events) {
      if (e.type === 'stage_transition') {
        lastStage[e.conversationId] = (e.payload.to as ConversationStage) ?? 'unknown';
        if (e.payload.to === 'booking') inBooking.add(e.conversationId);
      }
      if (e.type === 'intent_detected') {
        hadIntent.add(e.conversationId);
      }
    }

    const byStage: Partial<Record<ConversationStage | 'unknown', number>> = {};
    let beforeIntent  = 0;
    let duringBooking = 0;

    for (const e of events.filter(ev => ev.type === 'conversation_abandoned')) {
      const stage = lastStage[e.conversationId] ?? 'unknown';
      byStage[stage] = (byStage[stage] ?? 0) + 1;
      if (!hadIntent.has(e.conversationId)) beforeIntent++;
      if (inBooking.has(e.conversationId))  duringBooking++;
    }

    const top = (Object.entries(byStage) as [ConversationStage | 'unknown', number][])
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return { byStage, topDropoffStage: top, beforeIntent, duringBooking };
  },
};
