/**
 * ai/summarizer.ts
 *
 * Generates a structured conversation summary.
 * Called when a conversation reaches 'completed', 'escalated',
 * or manually via POST /api/v1/ai/summary.
 *
 * The summary is stored in the ConversationMemory and written back
 * to the Conversation document in MongoDB.
 */

import type { ConversationMemory, QualificationScore, Recommendation } from './types';

export interface ConversationSummary {
  leadProfile: {
    name:          string | null;
    company:       string | null;
    industry:      string | null;
    location:      string | null;
    employeeCount: string | null;
    phone:         string | null;
    email:         string | null;
    decisionMaker: boolean | null;
  };
  qualificationSummary: {
    score:       number;
    temperature: string;
    confidence:  number;
    reasons:     string[];
  };
  painPoints:           string[];
  goals:                string[];
  budget:               string | null;
  timeline:             string | null;
  servicesDiscussed:    string[];
  objections:           string[];
  recommendedSolutions: string[];
  bookingStatus:        string;
  nextAction:           string;
  fullSummary:          string;
  generatedAt:          string;
}

/**
 * Build a structured summary from memory + qualification + recommendations.
 * This is a deterministic, non-LLM summary used for analytics and CRM sync.
 */
export function buildSummary(
  memory:          ConversationMemory,
  score:           QualificationScore,
  recommendations: Recommendation[],
): ConversationSummary {
  const nextAction = determineNextAction(memory, score);

  const fullSummary = buildFullSummaryText(memory, score, recommendations, nextAction);

  return {
    leadProfile: {
      name:          memory.visitorName,
      company:       memory.company,
      industry:      memory.industry,
      location:      memory.location,
      employeeCount: memory.employeeCount,
      phone:         memory.phone,
      email:         memory.email,
      decisionMaker: memory.decisionMaker,
    },
    qualificationSummary: {
      score:       score.overall,
      temperature: score.temperature,
      confidence:  score.confidence,
      reasons:     score.reasons,
    },
    painPoints:           memory.painPoints,
    goals:                memory.goals,
    budget:               memory.budget,
    timeline:             memory.timeline,
    servicesDiscussed:    memory.servicesDiscussed,
    objections:           memory.objections,
    recommendedSolutions: recommendations.map(r => r.title),
    bookingStatus:        memory.bookingStatus,
    nextAction,
    fullSummary,
    generatedAt:          new Date().toISOString(),
  };
}

function determineNextAction(
  memory: ConversationMemory,
  score:  QualificationScore,
): string {
  if (memory.bookingStatus === 'booked')      return 'Appointment confirmed — prep call brief';
  if (memory.bookingStatus === 'requested')   return 'Follow up to confirm booking';
  if (score.temperature === 'Hot')            return 'Contact immediately — high buying intent';
  if (score.temperature === 'Warm')           return 'Follow up within 24 hours';
  if (score.temperature === 'Cold')           return 'Add to nurture sequence';
  if (score.temperature === 'Disqualified')   return 'Mark as disqualified — do not pursue';
  if (memory.objections.length > 0)           return 'Address objections in follow-up email';
  if (!memory.phone && !memory.email)         return 'Attempt to collect contact info';
  return 'Schedule a discovery call';
}

function buildFullSummaryText(
  memory:          ConversationMemory,
  score:           QualificationScore,
  recommendations: Recommendation[],
  nextAction:      string,
): string {
  const parts: string[] = [];

  // Identity
  const name    = memory.visitorName ?? 'Unknown visitor';
  const company = memory.company ? ` from ${memory.company}` : '';
  parts.push(`LEAD: ${name}${company}`);

  if (memory.industry)        parts.push(`Industry: ${memory.industry}`);
  if (memory.employeeCount)   parts.push(`Company size: ${memory.employeeCount} employees`);
  if (memory.decisionMaker)   parts.push(`Decision maker: Yes`);
  if (memory.budget)          parts.push(`Budget: ${memory.budget}`);
  if (memory.timeline)        parts.push(`Timeline: ${memory.timeline}`);

  // Contacts
  if (memory.phone) parts.push(`Phone: ${memory.phone}`);
  if (memory.email) parts.push(`Email: ${memory.email}`);

  // Qualification
  parts.push(`\nQUALIFICATION: ${score.temperature} (${score.overall}/100)`);
  if (score.reasons.length > 0) parts.push(`Signals: ${score.reasons.join('; ')}`);

  // Pain & goals
  if (memory.painPoints.length > 0) {
    parts.push(`\nPAIN POINTS: ${memory.painPoints.join(' | ')}`);
  }
  if (memory.goals.length > 0) {
    parts.push(`GOALS: ${memory.goals.join(' | ')}`);
  }

  // Recommendations
  if (recommendations.length > 0) {
    parts.push(`\nRECOMMENDED: ${recommendations.map(r => r.title).join(', ')}`);
  }

  // Objections
  if (memory.objections.length > 0) {
    parts.push(`\nOBJECTIONS: ${memory.objections.join('; ')}`);
  }

  // Booking
  if (memory.bookingStatus !== 'none') {
    parts.push(`\nBOOKING STATUS: ${memory.bookingStatus.toUpperCase()}`);
  }

  parts.push(`\nNEXT ACTION: ${nextAction}`);

  return parts.join('\n');
}
