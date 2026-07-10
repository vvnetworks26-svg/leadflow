/**
 * ai/tools.ts
 *
 * Internal tools callable by the orchestrator.
 * Each tool returns a typed ToolResult.
 * The orchestrator decides which tools to call based on context.
 */

import type { ToolResult, ToolName, KnowledgeEntry } from './types';
import { searchKnowledge } from './knowledge';
import { OrganizationModel } from '../models/Organization.model';
import { BusinessModel } from '../models/Business.model';
import { LeadModel } from '../models/Lead.model';
import { AppointmentModel } from '../models/Appointment.model';
import type { ConversationMemory } from './types';

// ─── Tool implementations ─────────────────────────────────────────────────────

async function lookupBusiness(organizationId: string): Promise<ToolResult> {
  try {
    const [org, biz] = await Promise.all([
      OrganizationModel.findById(organizationId).lean(),
      BusinessModel.findOne({ organizationId }).lean(),
    ]);
    return { tool: 'lookupBusiness', success: true, data: { org, biz } };
  } catch (e: any) {
    return { tool: 'lookupBusiness', success: false, data: null, error: e.message };
  }
}

async function lookupServices(organizationId: string): Promise<ToolResult> {
  try {
    const biz = await BusinessModel.findOne({ organizationId }).lean();
    const services = (biz as any)?.services?.filter((s: any) => s.active) ?? [];
    return { tool: 'lookupServices', success: true, data: services };
  } catch (e: any) {
    return { tool: 'lookupServices', success: false, data: [], error: e.message };
  }
}

function lookupPricing(): ToolResult {
  const pricing = searchKnowledge('pricing plans cost', 'Pricing', 5);
  return { tool: 'lookupPricing', success: true, data: pricing };
}

async function lookupFAQ(organizationId: string, query: string): Promise<ToolResult> {
  try {
    const biz = await BusinessModel.findOne({ organizationId }).lean();
    const orgFaq: KnowledgeEntry[] = ((biz as any)?.aiConfig?.faq ?? []).map((f: any) => ({
      id:       f.id,
      category: 'FAQ' as const,
      title:    f.question,
      content:  f.answer,
      tags:     ['faq'],
    }));
    const results = searchKnowledge(query, 'FAQ', 5, orgFaq);
    return { tool: 'lookupFAQ', success: true, data: results };
  } catch (e: any) {
    return { tool: 'lookupFAQ', success: false, data: [], error: e.message };
  }
}

function lookupCaseStudies(query: string): ToolResult {
  const results = searchKnowledge(query, 'CaseStudies', 3);
  return { tool: 'lookupCaseStudies', success: true, data: results };
}

function lookupIntegrations(query: string): ToolResult {
  const results = searchKnowledge(query, 'Integrations', 5);
  return { tool: 'lookupIntegrations', success: true, data: results };
}

async function lookupAvailability(organizationId: string, date?: string): Promise<ToolResult> {
  try {
    const biz = await BusinessModel.findOne({ organizationId }).lean();
    const hours = (biz as any)?.businessHours ?? {};
    const booked = await AppointmentModel.find({
      organizationId,
      status: { $in: ['Scheduled', 'Confirmed'] },
      ...(date ? { date } : {}),
    }).select('date time duration').lean();

    return {
      tool: 'lookupAvailability',
      success: true,
      data: { businessHours: hours, bookedSlots: booked },
    };
  } catch (e: any) {
    return { tool: 'lookupAvailability', success: false, data: null, error: e.message };
  }
}

async function bookAppointment(
  organizationId: string,
  memory:         ConversationMemory,
  params:         { date: string; time: string; type?: string; notes?: string }
): Promise<ToolResult> {
  try {
    if (!memory.visitorName || (!memory.phone && !memory.email)) {
      return {
        tool: 'bookAppointment',
        success: false,
        data: null,
        error: 'Missing visitor name or contact information',
      };
    }

    // Find or create lead first
    let lead = memory.phone
      ? await LeadModel.findOne({ organizationId, phone: { $regex: memory.phone } })
      : null;

    if (!lead) {
      lead = await LeadModel.create({
        organizationId,
        name:     memory.visitorName,
        phone:    memory.phone ?? '',
        email:    memory.email ?? '',
        hvacNeed: memory.servicesDiscussed[0] ?? 'General inquiry',
        source:   'ai_chat',
        status:   'Qualified',
      });
    }

    const appt = await AppointmentModel.create({
      organizationId,
      leadId:           lead.id,
      leadName:         memory.visitorName,
      leadPhone:        memory.phone ?? '',
      customerEmail:    memory.email ?? undefined,
      date:             params.date,
      time:             params.time,
      duration:         60,
      type:             (params.type as any) ?? 'Repair Consultation',
      status:           'Scheduled',
      notes:            params.notes ?? 'Booked via AI chat',
      confirmationNumber: `LF-${Date.now().toString(36).toUpperCase()}`,
    });

    return { tool: 'bookAppointment', success: true, data: { appointment: appt, leadId: lead.id } };
  } catch (e: any) {
    return { tool: 'bookAppointment', success: false, data: null, error: e.message };
  }
}

async function createLead(
  organizationId: string,
  memory:         ConversationMemory,
): Promise<ToolResult> {
  try {
    if (!memory.visitorName) {
      return { tool: 'createLead', success: false, data: null, error: 'Name required' };
    }
    const lead = await LeadModel.create({
      organizationId,
      name:     memory.visitorName,
      phone:    memory.phone ?? '',
      email:    memory.email ?? '',
      company:  memory.company ?? undefined,
      hvacNeed: memory.painPoints[0] ?? 'General inquiry',
      source:   'ai_chat',
      status:   'New',
    });
    return { tool: 'createLead', success: true, data: lead };
  } catch (e: any) {
    return { tool: 'createLead', success: false, data: null, error: e.message };
  }
}

async function updateLead(
  organizationId: string,
  leadId:         string,
  patch:          Record<string, unknown>,
): Promise<ToolResult> {
  try {
    const lead = await LeadModel.findOneAndUpdate(
      { _id: leadId, organizationId },
      patch,
      { new: true }
    );
    return { tool: 'updateLead', success: !!lead, data: lead };
  } catch (e: any) {
    return { tool: 'updateLead', success: false, data: null, error: e.message };
  }
}

function searchKnowledgeTool(query: string, category?: string): ToolResult {
  const results = searchKnowledge(query, category as any);
  return { tool: 'searchKnowledge', success: true, data: results };
}

function summarizeConversation(memory: ConversationMemory): ToolResult {
  const lines = [
    memory.visitorName  ? `Lead: ${memory.visitorName}` : null,
    memory.company      ? `Company: ${memory.company}`  : null,
    memory.industry     ? `Industry: ${memory.industry}`: null,
    memory.budget       ? `Budget: ${memory.budget}`    : null,
    memory.timeline     ? `Timeline: ${memory.timeline}`: null,
    memory.painPoints.length > 0 ? `Pains: ${memory.painPoints.join('; ')}` : null,
    memory.goals.length > 0      ? `Goals: ${memory.goals.join('; ')}`      : null,
    memory.servicesDiscussed.length > 0 ? `Interested in: ${memory.servicesDiscussed.join(', ')}` : null,
    memory.bookingStatus !== 'none' ? `Booking: ${memory.bookingStatus}` : null,
  ].filter(Boolean);

  const summary = lines.join('\n') || 'Conversation in progress — no key data collected yet.';
  return { tool: 'summarizeConversation', success: true, data: { summary } };
}

// ─── Tool dispatcher ──────────────────────────────────────────────────────────

export async function executeTool(
  toolName:       ToolName,
  params:         Record<string, unknown>,
  organizationId: string,
  memory:         ConversationMemory,
): Promise<ToolResult> {
  switch (toolName) {
    case 'lookupBusiness':     return lookupBusiness(organizationId);
    case 'lookupServices':     return lookupServices(organizationId);
    case 'lookupPricing':      return lookupPricing();
    case 'lookupFAQ':          return lookupFAQ(organizationId, String(params.query ?? ''));
    case 'lookupCaseStudies':  return lookupCaseStudies(String(params.query ?? ''));
    case 'lookupIntegrations': return lookupIntegrations(String(params.query ?? ''));
    case 'lookupAvailability': return lookupAvailability(organizationId, params.date as string);
    case 'bookAppointment':    return bookAppointment(organizationId, memory, params as any);
    case 'createLead':         return createLead(organizationId, memory);
    case 'updateLead':         return updateLead(organizationId, String(params.leadId), params.patch as any ?? {});
    case 'searchKnowledge':    return searchKnowledgeTool(String(params.query ?? ''), params.category as string);
    case 'summarizeConversation': return summarizeConversation(memory);
    default:
      return { tool: toolName, success: false, data: null, error: `Unknown tool: ${toolName}` };
  }
}

/**
 * Determine which tools to automatically call based on context.
 * Returns a list of tool calls to execute before building the prompt.
 */
export function selectAutoTools(
  userMessage:  string,
  stage:        string,
  intent:       string,
): ToolName[] {
  const tools: ToolName[] = [];
  const lower = userMessage.toLowerCase();

  if (/price|cost|how much|plan|subscription/i.test(lower)) tools.push('lookupPricing');
  if (/integrat|connect|sync|api|webhook/i.test(lower))     tools.push('lookupIntegrations');
  if (/case study|example|customer|client/i.test(lower))    tools.push('lookupCaseStudies');
  if (/faq|question|how does|what is/i.test(lower))         tools.push('lookupFAQ');
  if (stage === 'recommendation')                            tools.push('lookupServices');
  if (stage === 'booking' || intent === 'Booking')           tools.push('lookupAvailability');

  return [...new Set(tools)];
}
