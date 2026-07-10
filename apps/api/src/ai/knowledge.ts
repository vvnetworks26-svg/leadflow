/**
 * ai/knowledge.ts
 *
 * In-memory knowledge base with semantic keyword search.
 * Organization-specific entries overlay the defaults.
 * Categories: Services, Pricing, FAQ, Integrations, CaseStudies, Policies, Technical, Company
 */

import type { KnowledgeEntry, KnowledgeCategory } from './types';

// ─── Default knowledge base (product-agnostic, overridable per org) ───────────

const DEFAULT_KB: KnowledgeEntry[] = [
  // ── Services ───────────────────────────────────────────────────────────────
  {
    id: 'svc_leadflow',
    category: 'Services',
    title: 'LeadFlow — AI-Powered Lead Management',
    content: `LeadFlow is a multi-tenant CRM and AI conversation platform. It captures leads via embeddable chat widgets, qualifies them automatically, and routes warm leads to your sales team. Features include: AI SDR chat, lead scoring, appointment booking, conversation memory, analytics dashboard, and team management.`,
    tags: ['crm', 'lead management', 'ai', 'chat widget', 'sales'],
  },
  {
    id: 'svc_website',
    category: 'Services',
    title: 'Website Automation',
    content: `We build high-converting websites with built-in automation — lead capture forms, AI chat, email sequences, and CRM sync. Every visitor interaction is tracked and scored automatically.`,
    tags: ['website', 'landing page', 'automation', 'conversion'],
  },
  {
    id: 'svc_ai_agent',
    category: 'Services',
    title: 'AI Agent Development',
    content: `Custom AI agents built for your specific business process — customer support bots, sales assistants, scheduling agents, data extraction pipelines. Powered by the latest LLM technology with guardrails and human handoff.`,
    tags: ['ai agent', 'chatbot', 'custom ai', 'llm'],
  },
  {
    id: 'svc_crm_integration',
    category: 'Services',
    title: 'CRM Integration',
    content: `We connect your existing tools — Salesforce, HubSpot, Pipedrive, Zoho — to LeadFlow so your team has one unified view. Bi-directional sync, custom field mapping, and webhook automation.`,
    tags: ['crm', 'salesforce', 'hubspot', 'integration', 'sync'],
  },
  {
    id: 'svc_custom_software',
    category: 'Services',
    title: 'Custom Software Development',
    content: `End-to-end custom software — web apps, mobile apps, internal tools, APIs. TypeScript/Node.js backend, React frontend, MongoDB/PostgreSQL. Agile delivery with weekly demos.`,
    tags: ['software', 'custom development', 'web app', 'mobile app'],
  },

  // ── Pricing ────────────────────────────────────────────────────────────────
  {
    id: 'price_leadflow',
    category: 'Pricing',
    title: 'LeadFlow Pricing Plans',
    content: `LeadFlow offers flexible plans: Free (up to 50 leads/month, 1 user), Starter ($49/month — 500 leads, 5 users, AI chat), Pro ($149/month — unlimited leads, 20 users, full AI engine, analytics), Enterprise (custom — unlimited everything, SLA, dedicated support). Annual billing saves 20%.`,
    tags: ['pricing', 'plans', 'cost', 'subscription', 'free trial'],
  },
  {
    id: 'price_services',
    category: 'Pricing',
    title: 'Professional Services Pricing',
    content: `Custom projects are quoted individually based on scope. Website automation starts at $3,000. Custom AI agents from $5,000. CRM integration projects from $2,500. Custom software from $15,000. All projects include discovery, design, development, testing, and 30-day post-launch support.`,
    tags: ['pricing', 'project cost', 'custom', 'quote'],
  },

  // ── FAQ ────────────────────────────────────────────────────────────────────
  {
    id: 'faq_setup',
    category: 'FAQ',
    title: 'How long does setup take?',
    content: `LeadFlow can be up and running in under 10 minutes. Embed the widget script on your site, configure your AI, and you're live. CRM integrations take 1–3 days. Custom projects follow a project timeline agreed upfront.`,
    tags: ['setup', 'onboarding', 'time to value', 'implementation'],
  },
  {
    id: 'faq_trial',
    category: 'FAQ',
    title: 'Is there a free trial?',
    content: `Yes — LeadFlow's free tier is permanent, not a trial. You get 50 leads/month and 1 user for free, forever. Paid plans include a 14-day money-back guarantee.`,
    tags: ['free trial', 'free plan', 'guarantee', 'risk'],
  },
  {
    id: 'faq_data',
    category: 'FAQ',
    title: 'Is my data secure?',
    content: `All data is encrypted in transit (TLS 1.3) and at rest (AES-256). LeadFlow is SOC 2 Type II compliant. Each organization's data is fully isolated — no cross-tenant data access. GDPR and CCPA compliant. Data can be exported or deleted on request.`,
    tags: ['security', 'data', 'privacy', 'gdpr', 'compliance'],
  },
  {
    id: 'faq_cancel',
    category: 'FAQ',
    title: 'Can I cancel anytime?',
    content: `Yes — monthly plans can be cancelled at any time with immediate effect. Annual plans can be cancelled at renewal. No lock-in, no cancellation fees. Your data is available for 30 days after cancellation.`,
    tags: ['cancel', 'contract', 'commitment', 'refund'],
  },

  // ── Integrations ───────────────────────────────────────────────────────────
  {
    id: 'int_crm',
    category: 'Integrations',
    title: 'CRM Integrations',
    content: `Native integrations with Salesforce, HubSpot, Pipedrive, Zoho CRM, and Monday.com. Leads created in LeadFlow automatically appear in your CRM. Two-way sync keeps contact data consistent.`,
    tags: ['crm', 'salesforce', 'hubspot', 'pipedrive', 'zoho', 'sync'],
  },
  {
    id: 'int_calendar',
    category: 'Integrations',
    title: 'Calendar & Scheduling',
    content: `Google Calendar and Outlook integration for appointment booking. Calendly and Cal.com support via webhook. AI automatically checks availability and books slots without human intervention.`,
    tags: ['calendar', 'google calendar', 'outlook', 'calendly', 'scheduling'],
  },
  {
    id: 'int_zapier',
    category: 'Integrations',
    title: 'Zapier & Make (Formerly Integromat)',
    content: `Connect LeadFlow to 5,000+ apps via Zapier or Make. Trigger automations when a lead is created, a score changes, or a booking is made. No code required.`,
    tags: ['zapier', 'make', 'automation', 'no-code', 'workflow'],
  },

  // ── Case Studies ───────────────────────────────────────────────────────────
  {
    id: 'case_hvac',
    category: 'CaseStudies',
    title: 'HVAC Company — 3× Lead Conversion',
    content: `A regional HVAC company used LeadFlow to replace their manual phone intake process. The AI widget qualifies leads, books appointments, and sends confirmations automatically. Result: 3× more bookings with the same team size, 40% reduction in no-shows.`,
    tags: ['hvac', 'case study', 'results', 'booking', 'conversion'],
  },
  {
    id: 'case_agency',
    category: 'CaseStudies',
    title: 'Marketing Agency — Scaled to 10× Lead Volume',
    content: `A digital marketing agency implemented LeadFlow across their client portfolio. AI qualification filters out non-buyers before they reach sales reps. Result: reps spend 80% less time on unqualified leads, pipeline quality improved significantly.`,
    tags: ['agency', 'marketing', 'qualification', 'pipeline', 'scale'],
  },

  // ── Policies ───────────────────────────────────────────────────────────────
  {
    id: 'pol_refund',
    category: 'Policies',
    title: 'Refund Policy',
    content: `Software subscriptions: 14-day money-back guarantee on first payment. Professional services: 50% refund if cancelled within 7 days of project kickoff. After development starts, refunds are pro-rated based on work completed.`,
    tags: ['refund', 'money back', 'policy', 'guarantee'],
  },
  {
    id: 'pol_sla',
    category: 'Policies',
    title: 'Service Level Agreement',
    content: `Pro and Enterprise plans: 99.9% uptime SLA. Support response times: Starter — 24 hours, Pro — 8 hours, Enterprise — 1 hour (24/7). Maintenance windows are scheduled outside business hours with 48 hours notice.`,
    tags: ['sla', 'uptime', 'support', 'response time', 'reliability'],
  },

  // ── Technical ──────────────────────────────────────────────────────────────
  {
    id: 'tech_api',
    category: 'Technical',
    title: 'REST API',
    content: `LeadFlow exposes a fully documented REST API (OpenAPI 3.0). All operations — leads, conversations, appointments, analytics — are available via API. Authentication uses JWT Bearer tokens. Rate limit: 1,000 requests/hour on Pro, unlimited on Enterprise.`,
    tags: ['api', 'rest', 'openapi', 'developer', 'integration'],
  },
  {
    id: 'tech_webhook',
    category: 'Technical',
    title: 'Webhooks',
    content: `Real-time webhooks fire on: lead created, lead qualified, appointment booked, conversation completed, stage change. Payloads are signed with HMAC-SHA256. Retry logic handles temporary failures with exponential backoff.`,
    tags: ['webhook', 'real-time', 'events', 'integration', 'notification'],
  },
];

// ─── Search ───────────────────────────────────────────────────────────────────

/**
 * Simple keyword-based knowledge search.
 * Scores each entry by how many query terms match title, content, or tags.
 * Returns top K entries sorted by relevance.
 */
export function searchKnowledge(
  query:    string,
  category?: KnowledgeCategory,
  topK    = 3,
  orgKb?: KnowledgeEntry[],
): KnowledgeEntry[] {
  const kb     = orgKb ? [...DEFAULT_KB, ...orgKb] : DEFAULT_KB;
  const terms  = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

  const scored = kb
    .filter(e => !category || e.category === category)
    .map(entry => {
      const text = `${entry.title} ${entry.content} ${entry.tags.join(' ')}`.toLowerCase();
      const score = terms.reduce((s, t) => s + (text.split(t).length - 1), 0);
      return { ...entry, relevance: score };
    })
    .filter(e => e.relevance > 0)
    .sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0))
    .slice(0, topK);

  return scored;
}

/**
 * Format knowledge entries for prompt injection.
 */
export function formatKnowledgeForPrompt(entries: KnowledgeEntry[]): string {
  if (entries.length === 0) return '';
  return '[RELEVANT KNOWLEDGE]\n' +
    entries.map(e => `• ${e.title}: ${e.content}`).join('\n') +
    '\n[/RELEVANT KNOWLEDGE]';
}
