/**
 * ai/qualification.ts
 *
 * Lead qualification scoring engine.
 * Evaluates 10 dimensions and produces a composite score + temperature.
 * Runs on every turn so the score improves as the AI collects more data.
 */

import type { ConversationMemory, QualificationScore, LeadTemperature } from './types';

// ─── Industry weights ─────────────────────────────────────────────────────────

const HIGH_VALUE_INDUSTRIES = [
  'saas', 'software', 'technology', 'fintech', 'healthcare', 'ecommerce',
  'real estate', 'legal', 'financial services', 'consulting', 'agency',
  'manufacturing', 'retail', 'insurance',
];

const LOW_VALUE_INDUSTRIES = [
  'student', 'personal', 'hobby', 'non-profit', 'education',
];

// ─── Scoring functions ────────────────────────────────────────────────────────

function scoreIndustry(industry: string | null): number {
  if (!industry) return 40;   // unknown = neutral
  const lower = industry.toLowerCase();
  if (HIGH_VALUE_INDUSTRIES.some(i => lower.includes(i))) return 85;
  if (LOW_VALUE_INDUSTRIES.some(i => lower.includes(i)))  return 20;
  return 55;
}

function scoreCompanySize(employeeCount: string | null): number {
  if (!employeeCount) return 40;
  const num = parseInt(employeeCount.replace(/[^0-9]/g, ''), 10);
  if (isNaN(num)) return 40;
  if (num >= 500)  return 95;
  if (num >= 100)  return 85;
  if (num >= 50)   return 75;
  if (num >= 20)   return 65;
  if (num >= 10)   return 55;
  if (num >= 5)    return 45;
  return 30;
}

function scoreDecisionMaker(dm: boolean | null): number {
  if (dm === null)  return 50;   // unknown
  if (dm === true)  return 95;
  return 25;
}

function scoreBudget(budget: string | null): number {
  if (!budget) return 35;
  const lower = budget.toLowerCase().replace(/[$,k]/g, '');
  const num   = parseFloat(lower) * (lower.includes('k') ? 1000 : 1);
  if (!isNaN(num)) {
    if (num >= 50000)  return 95;
    if (num >= 20000)  return 85;
    if (num >= 10000)  return 75;
    if (num >= 5000)   return 65;
    if (num >= 1000)   return 50;
    return 30;
  }
  // Qualitative keywords
  if (/flexible|open|not a concern/i.test(budget)) return 80;
  if (/limited|tight|small/i.test(budget))          return 35;
  return 45;
}

function scoreTimeline(timeline: string | null): number {
  if (!timeline) return 35;
  const lower = timeline.toLowerCase();
  if (/asap|immediately|right away|this week/i.test(lower)) return 95;
  if (/this month|30 days/i.test(lower))                    return 85;
  if (/next month|60 days|this quarter/i.test(lower))       return 70;
  if (/3 months|90 days|next quarter/i.test(lower))         return 55;
  if (/6 months|this year/i.test(lower))                    return 40;
  return 30;
}

function scoreUrgency(painPoints: string[], objections: string[]): number {
  const urgencyWords = [
    'urgent', 'asap', 'critical', 'emergency', 'crisis', 'immediately',
    'bleeding', 'losing', 'can\'t afford to wait', 'must fix',
  ];
  const text = [...painPoints].join(' ').toLowerCase();
  const hits = urgencyWords.filter(w => text.includes(w)).length;
  const base = Math.min(90, 40 + hits * 15);
  // Objections reduce urgency
  const objectionPenalty = objections.length * 8;
  return Math.max(10, base - objectionPenalty);
}

function scoreTechnicalReady(_memory: ConversationMemory): number {
  // Proxy: if they mentioned API/integration it means technical readiness
  const tech = [
    ..._memory.servicesDiscussed,
    ..._memory.questionsAnswered,
  ].join(' ').toLowerCase();
  if (/api|integration|webhook|sdk/i.test(tech)) return 80;
  return 60;   // assume moderate
}

function scoreAIReady(memory: ConversationMemory): number {
  const goals = memory.goals.join(' ').toLowerCase();
  const pains = memory.painPoints.join(' ').toLowerCase();
  const combined = goals + ' ' + pains;
  const aiKeywords = [
    'automate', 'ai', 'machine learning', 'intelligent', 'smart', 'automatic',
    'efficiency', 'scale', 'manual work', 'repetitive',
  ];
  const hits = aiKeywords.filter(k => combined.includes(k)).length;
  return Math.min(90, 45 + hits * 10);
}

function scorePainSeverity(painPoints: string[]): number {
  if (painPoints.length === 0) return 20;
  const severityWords = [
    'critical', 'urgent', 'severe', 'major', 'significant', 'serious',
    'biggest', 'worst', 'terrible', 'awful', 'losing',
  ];
  const text = painPoints.join(' ').toLowerCase();
  const hits = severityWords.filter(w => text.includes(w)).length;
  return Math.min(95, 35 + painPoints.length * 12 + hits * 8);
}

function scoreBuyingIntent(
  memory: ConversationMemory,
  bookingStatus: ConversationMemory['bookingStatus'],
  demoRequested: boolean,
): number {
  let score = 30;
  if (memory.email || memory.phone)         score += 15;
  if (bookingStatus === 'requested')        score += 25;
  if (bookingStatus === 'booked')           score += 40;
  if (demoRequested)                        score += 20;
  if (memory.budget)                        score += 10;
  if (memory.timeline)                      score += 10;
  const objectionPenalty = memory.objections.length * 8;
  return Math.max(5, Math.min(95, score - objectionPenalty));
}

// ─── Temperature thresholds ───────────────────────────────────────────────────

function toTemperature(score: number): LeadTemperature {
  if (score >= 75) return 'Hot';
  if (score >= 55) return 'Warm';
  if (score >= 30) return 'Cold';
  return 'Disqualified';
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute a full qualification score from conversation memory.
 * Called on every orchestrator turn.
 */
export function qualifyLead(memory: ConversationMemory): QualificationScore {
  const breakdown = {
    industry:       scoreIndustry(memory.industry),
    companySize:    scoreCompanySize(memory.employeeCount),
    decisionMaker:  scoreDecisionMaker(memory.decisionMaker),
    budget:         scoreBudget(memory.budget),
    timeline:       scoreTimeline(memory.timeline),
    urgency:        scoreUrgency(memory.painPoints, memory.objections),
    technicalReady: scoreTechnicalReady(memory),
    aiReady:        scoreAIReady(memory),
    painSeverity:   scorePainSeverity(memory.painPoints),
    buyingIntent:   scoreBuyingIntent(memory, memory.bookingStatus, memory.demoRequested),
  };

  // Weighted average — buying intent and decision maker are highest weight
  const weights = {
    industry: 0.07, companySize: 0.08, decisionMaker: 0.12,
    budget: 0.12, timeline: 0.10, urgency: 0.10,
    technicalReady: 0.07, aiReady: 0.07, painSeverity: 0.12, buyingIntent: 0.15,
  };

  const overall = Math.round(
    Object.entries(breakdown).reduce((sum, [key, val]) => {
      return sum + val * weights[key as keyof typeof weights];
    }, 0)
  );

  const temperature = toTemperature(overall);

  // Collect reasons
  const reasons: string[] = [];
  if (breakdown.buyingIntent >= 70)   reasons.push('Strong buying signals detected');
  if (breakdown.decisionMaker >= 90)  reasons.push('Confirmed decision maker');
  if (breakdown.urgency >= 70)        reasons.push('High urgency expressed');
  if (breakdown.budget >= 75)         reasons.push('Adequate budget indicated');
  if (breakdown.timeline <= 30)       reasons.push('Timeline is distant or unclear');
  if (memory.objections.length > 1)   reasons.push(`${memory.objections.length} objections raised`);
  if (breakdown.painSeverity >= 70)   reasons.push('Significant pain points identified');

  // Missing info
  const missingInfo: string[] = [];
  if (!memory.budget)                   missingInfo.push('Budget');
  if (!memory.timeline)                 missingInfo.push('Timeline');
  if (memory.decisionMaker === null)    missingInfo.push('Decision-maker status');
  if (!memory.company)                  missingInfo.push('Company name');
  if (memory.painPoints.length === 0)   missingInfo.push('Pain points');

  return {
    overall,
    temperature,
    confidence: Math.min(95, 30 + Object.values(breakdown).filter(v => v > 40).length * 7),
    breakdown,
    reasons,
    missingInfo,
  };
}

/**
 * Returns true when the lead is warm enough to trigger booking handoff.
 */
export function shouldTriggerBooking(score: QualificationScore): boolean {
  return score.overall >= 60 || score.temperature === 'Hot';
}
