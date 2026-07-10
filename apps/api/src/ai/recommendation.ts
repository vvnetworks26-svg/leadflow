/**
 * ai/recommendation.ts
 *
 * Recommendation engine.
 * Matches the lead's profile to the most relevant products/services.
 * Explains WHY each recommendation is relevant to that specific lead.
 */

import type { ConversationMemory, Recommendation, ProductType, QualificationScore } from './types';

// ─── Product definitions ──────────────────────────────────────────────────────

interface ProductProfile {
  type:          ProductType;
  title:         string;
  industryFit:   string[];          // industries where this shines
  painFit:       string[];          // pain point keywords
  goalFit:       string[];          // goal keywords
  minCompany:    number;            // min employee count
  urgencyBoost:  boolean;           // true = higher score on high urgency
}

const PRODUCTS: ProductProfile[] = [
  {
    type:          'LeadFlow',
    title:         'LeadFlow — AI Lead Management Platform',
    industryFit:   ['hvac', 'plumbing', 'roofing', 'agency', 'consulting', 'real estate', 'service', 'saas', 'software'],
    painFit:       ['leads', 'follow up', 'conversion', 'booking', 'manual', 'miss', 'slow', 'qualify', 'pipeline'],
    goalFit:       ['more leads', 'automate', 'qualify', 'scale', 'book', 'grow', 'convert'],
    minCompany:    1,
    urgencyBoost:  true,
  },
  {
    type:          'WebsiteAutomation',
    title:         'Website + Conversion Automation',
    industryFit:   ['retail', 'ecommerce', 'service', 'agency', 'consulting', 'local business'],
    painFit:       ['website', 'traffic', 'conversion', 'bounce', 'no leads', 'outdated site', 'slow site'],
    goalFit:       ['website', 'more traffic', 'convert visitors', 'online presence', 'seo'],
    minCompany:    1,
    urgencyBoost:  false,
  },
  {
    type:          'AIAgent',
    title:         'Custom AI Agent',
    industryFit:   ['saas', 'fintech', 'healthcare', 'legal', 'enterprise', 'technology', 'software'],
    painFit:       ['support tickets', 'repetitive questions', 'customer service', 'manual process', 'data entry', '24/7'],
    goalFit:       ['automate support', 'ai', 'reduce costs', 'scale customer service', '24/7 availability'],
    minCompany:    10,
    urgencyBoost:  false,
  },
  {
    type:          'CRMIntegration',
    title:         'CRM Integration & Data Sync',
    industryFit:   ['saas', 'enterprise', 'consulting', 'financial services', 'insurance'],
    painFit:       ['salesforce', 'hubspot', 'data silos', 'manual entry', 'duplicate', 'sync', 'crm not working'],
    goalFit:       ['integrate', 'sync', 'unified view', 'one system', 'connect tools'],
    minCompany:    5,
    urgencyBoost:  false,
  },
  {
    type:          'CustomSoftware',
    title:         'Custom Software Development',
    industryFit:   ['manufacturing', 'logistics', 'healthcare', 'finance', 'enterprise'],
    painFit:       ['legacy system', 'outdated software', 'no solution exists', 'workaround', 'spreadsheet', 'manual process'],
    goalFit:       ['build', 'custom', 'internal tool', 'specific needs', 'replace legacy'],
    minCompany:    20,
    urgencyBoost:  false,
  },
  {
    type:          'MarketingAutomation',
    title:         'Marketing Automation',
    industryFit:   ['ecommerce', 'saas', 'agency', 'retail'],
    painFit:       ['email', 'nurture', 'drip', 'campaign', 'marketing', 'unsubscribe', 'engagement'],
    goalFit:       ['nurture leads', 'email marketing', 'drip campaign', 're-engage', 'upsell'],
    minCompany:    5,
    urgencyBoost:  false,
  },
];

// ─── Scoring ──────────────────────────────────────────────────────────────────

function scoreProduct(
  product: ProductProfile,
  memory:  ConversationMemory,
  score:   QualificationScore,
): number {
  let fit = 0;

  // Industry fit
  const industry = (memory.industry ?? '').toLowerCase();
  if (product.industryFit.some(i => industry.includes(i))) fit += 30;

  // Pain point fit
  const pains = memory.painPoints.join(' ').toLowerCase();
  const painHits = product.painFit.filter(p => pains.includes(p)).length;
  fit += painHits * 12;

  // Goal fit
  const goals = memory.goals.join(' ').toLowerCase();
  const goalHits = product.goalFit.filter(g => goals.includes(g)).length;
  fit += goalHits * 10;

  // Company size
  const employees = parseInt((memory.employeeCount ?? '0').replace(/[^0-9]/g, ''), 10);
  if (employees >= product.minCompany) fit += 10;
  else if (product.minCompany > 1)     fit -= 15;

  // Urgency bonus
  if (product.urgencyBoost && score.breakdown.urgency >= 70) fit += 15;

  return Math.min(100, Math.max(0, fit));
}

function buildWhy(product: ProductProfile, memory: ConversationMemory): string {
  const parts: string[] = [];

  const pains = memory.painPoints.join(' ').toLowerCase();
  const matchedPains = product.painFit.filter(p => pains.includes(p));
  if (matchedPains.length > 0) {
    parts.push(`addresses your challenge with ${matchedPains[0]}`);
  }

  const goals = memory.goals.join(' ').toLowerCase();
  const matchedGoals = product.goalFit.filter(g => goals.includes(g));
  if (matchedGoals.length > 0) {
    parts.push(`directly supports your goal to ${matchedGoals[0]}`);
  }

  const industry = memory.industry;
  if (industry && product.industryFit.some(i => industry.toLowerCase().includes(i))) {
    parts.push(`proven in the ${industry} industry`);
  }

  if (parts.length === 0) parts.push('aligns with your business profile');
  return parts.join(', ');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate top-N product recommendations for a lead.
 * Sorted by fitScore descending.
 */
export function generateRecommendations(
  memory:  ConversationMemory,
  score:   QualificationScore,
  topN = 3,
): Recommendation[] {
  return PRODUCTS
    .map(product => ({
      product:  product.type,
      title:    product.title,
      why:      buildWhy(product, memory),
      fitScore: scoreProduct(product, memory, score),
      urgency:  (score.breakdown.urgency >= 70 ? 'high' : score.breakdown.urgency >= 45 ? 'medium' : 'low') as Recommendation['urgency'],
    }))
    .filter(r => r.fitScore >= 20)
    .sort((a, b) => b.fitScore - a.fitScore)
    .slice(0, topN);
}

/**
 * Format recommendations for prompt injection.
 */
export function formatRecommendationsForPrompt(recs: Recommendation[]): string {
  if (recs.length === 0) return '';
  return '[RECOMMENDED PRODUCTS]\n' +
    recs.map(r => `• ${r.title} (fit: ${r.fitScore}%): ${r.why}`).join('\n') +
    '\n[/RECOMMENDED PRODUCTS]';
}
