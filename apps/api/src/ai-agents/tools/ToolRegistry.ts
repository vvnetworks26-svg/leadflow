/**
 * ToolRegistry.ts
 *
 * Built-in tool registry for AI agents.
 * Tools are callable by the orchestrator during the reasoning loop.
 * Organizations may also register custom tools (stored in Agent.tools).
 */

import { LeadModel }            from '../../models/Lead.model';
import { BookingModel }         from '../../models/Booking.model';
import { TaskModel }            from '../../models/Task.model';
import { NoteModel }            from '../../models/Note.model';
import { KnowledgeService }     from '../knowledge/KnowledgeService';
import { WorkflowEngine }       from '../../automation/engine/WorkflowEngine';
import { MessageService }       from '../../communications/inbox/MessageService';
import { InsightsService }      from '../../dashboard/insights/InsightsService';

export interface ToolDefinition {
  name:        string;
  description: string;
  parameters:  Record<string, { type: string; description: string; required?: boolean }>;
}

export interface ToolResult {
  tool:    string;
  success: boolean;
  data:    unknown;
  error?:  string;
}

// ─── Tool implementations ─────────────────────────────────────────────────────

async function searchCrm(params: Record<string, unknown>, orgId: string): Promise<ToolResult> {
  try {
    const q   = String(params.query ?? '');
    const re  = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const leads = await LeadModel.find({
      organizationId: orgId,
      $or: [{ name: re }, { email: re }, { phone: re }, { company: re }],
    }).limit(5).lean();
    return { tool: 'search_crm', success: true, data: leads.map(l => ({ id: l._id, name: l.name, email: l.email, status: l.status, score: (l as any).score })) };
  } catch (e: any) { return { tool: 'search_crm', success: false, data: null, error: e.message }; }
}

async function createLead(params: Record<string, unknown>, orgId: string): Promise<ToolResult> {
  try {
    const doc = await LeadModel.create({
      organizationId: orgId,
      name:     String(params.name    ?? 'Unknown'),
      phone:    String(params.phone   ?? ''),
      email:    String(params.email   ?? ''),
      hvacNeed: String(params.need    ?? 'General inquiry'),
      source:   String(params.source  ?? 'ai_agent'),
    });
    return { tool: 'create_lead', success: true, data: { id: doc.id, name: doc.name } };
  } catch (e: any) { return { tool: 'create_lead', success: false, data: null, error: e.message }; }
}

async function createBooking(params: Record<string, unknown>, orgId: string): Promise<ToolResult> {
  try {
    const { BookingService } = require('../../calendar/bookings/BookingService');
    const booking = await BookingService.create({
      organizationId:  orgId,
      meetingTypeId:   String(params.meetingTypeId ?? ''),
      guestName:       String(params.guestName ?? ''),
      guestEmail:      String(params.guestEmail ?? ''),
      startUtc:        new Date(String(params.startUtc ?? new Date())),
      notes:           String(params.notes ?? 'Booked by AI agent'),
    });
    return { tool: 'create_booking', success: true, data: { id: booking.id, confirmationCode: booking.confirmationCode } };
  } catch (e: any) { return { tool: 'create_booking', success: false, data: null, error: e.message }; }
}

async function createTask(params: Record<string, unknown>, orgId: string): Promise<ToolResult> {
  try {
    const doc = await TaskModel.create({
      organizationId: orgId,
      title:       String(params.title    ?? 'Follow up'),
      type:        String(params.type     ?? 'Follow-up'),
      priority:    String(params.priority ?? 'Medium'),
      leadId:      params.leadId ?? null,
      ownerId:     params.ownerId ?? null,
      dueDate:     params.dueDays ? new Date(Date.now() + Number(params.dueDays) * 86400_000) : null,
    });
    return { tool: 'create_task', success: true, data: { id: doc.id } };
  } catch (e: any) { return { tool: 'create_task', success: false, data: null, error: e.message }; }
}

async function createNote(params: Record<string, unknown>, orgId: string): Promise<ToolResult> {
  try {
    const doc = await NoteModel.create({
      organizationId: orgId,
      content:     String(params.content ?? ''),
      leadId:      params.leadId ?? null,
      authorId:    'ai_agent',
      isAIGenerated: true,
    });
    return { tool: 'create_note', success: true, data: { id: doc.id } };
  } catch (e: any) { return { tool: 'create_note', success: false, data: null, error: e.message }; }
}

async function searchKnowledge(params: Record<string, unknown>, orgId: string): Promise<ToolResult> {
  try {
    const results = await KnowledgeService.search(orgId, String(params.query ?? ''), Number(params.topK ?? 3));
    const formatted = KnowledgeService.formatForPrompt(results);
    return { tool: 'search_knowledge', success: true, data: { results: results.map(r => ({ content: r.chunk.content, score: r.score })), formatted } };
  } catch (e: any) { return { tool: 'search_knowledge', success: false, data: null, error: e.message }; }
}

async function runWorkflow(params: Record<string, unknown>, orgId: string): Promise<ToolResult> {
  try {
    const execId = await WorkflowEngine.executeManual(orgId, String(params.workflowId ?? ''), params.data as any ?? {});
    return { tool: 'run_workflow', success: true, data: { executionId: execId } };
  } catch (e: any) { return { tool: 'run_workflow', success: false, data: null, error: e.message }; }
}

async function getDashboardInsights(params: Record<string, unknown>, orgId: string): Promise<ToolResult> {
  try {
    const insights = await InsightsService.generate(orgId);
    return { tool: 'dashboard_insights', success: true, data: insights.slice(0, 3) };
  } catch (e: any) { return { tool: 'dashboard_insights', success: false, data: null, error: e.message }; }
}

async function sendEmail(params: Record<string, unknown>, orgId: string): Promise<ToolResult> {
  try {
    // Find or create a thread
    const { ConversationThreadModel } = require('../../models/ConversationThread.model');
    const thread = await ConversationThreadModel.findOne({ organizationId: orgId, leadId: params.leadId ?? null }) ??
      await ConversationThreadModel.create({ organizationId: orgId, channels: ['email'], status: 'open', subject: params.subject });
    await MessageService.send({
      organizationId: orgId, threadId: thread._id.toString(), channel: 'email',
      direction: 'outbound', from: params.from as string ?? 'agent@leadflow.app',
      to: String(params.to ?? ''), subject: String(params.subject ?? ''), body: String(params.body ?? ''),
    });
    return { tool: 'send_email', success: true, data: { sent: true, to: params.to } };
  } catch (e: any) { return { tool: 'send_email', success: false, data: null, error: e.message }; }
}

async function searchCalendar(params: Record<string, unknown>, orgId: string): Promise<ToolResult> {
  try {
    const bookings = await BookingModel.find({
      organizationId: orgId,
      status: { $in: ['confirmed','rescheduled'] },
      startUtc: { $gte: new Date() },
    }).limit(5).lean();
    return { tool: 'search_calendar', success: true, data: bookings.map(b => ({ id: b._id, guest: b.guestName, start: b.startUtc, type: b.meetingTypeName })) };
  } catch (e: any) { return { tool: 'search_calendar', success: false, data: null, error: e.message }; }
}

// ─── Built-in tool definitions ────────────────────────────────────────────────

export const BUILT_IN_TOOLS: ToolDefinition[] = [
  { name: 'search_crm',         description: 'Search CRM leads by name, email, phone, or company', parameters: { query: { type: 'string', description: 'Search query', required: true } } },
  { name: 'create_lead',        description: 'Create a new CRM lead', parameters: { name: { type:'string', description:'Lead name', required:true }, phone:{type:'string',description:'Phone'}, email:{type:'string',description:'Email'}, need:{type:'string',description:'Service need'} } },
  { name: 'create_booking',     description: 'Book a meeting slot', parameters: { meetingTypeId:{type:'string',description:'Meeting type ID',required:true}, guestName:{type:'string',description:'Guest name',required:true}, guestEmail:{type:'string',description:'Guest email',required:true}, startUtc:{type:'string',description:'ISO start time',required:true} } },
  { name: 'create_task',        description: 'Create a CRM task', parameters: { title:{type:'string',description:'Task title',required:true}, type:{type:'string',description:'Task type'}, priority:{type:'string',description:'Priority'}, leadId:{type:'string',description:'Lead ID'}, dueDays:{type:'number',description:'Due days from now'} } },
  { name: 'create_note',        description: 'Add an internal note to a lead', parameters: { content:{type:'string',description:'Note content',required:true}, leadId:{type:'string',description:'Lead ID'} } },
  { name: 'search_knowledge',   description: 'Search the organization knowledge base', parameters: { query:{type:'string',description:'Search query',required:true}, topK:{type:'number',description:'Max results'} } },
  { name: 'run_workflow',       description: 'Trigger an automation workflow', parameters: { workflowId:{type:'string',description:'Workflow ID',required:true} } },
  { name: 'dashboard_insights', description: 'Get AI executive insights from the dashboard', parameters: {} },
  { name: 'send_email',         description: 'Send an email via communications platform', parameters: { to:{type:'string',description:'Recipient email',required:true}, subject:{type:'string',description:'Subject',required:true}, body:{type:'string',description:'Email body',required:true} } },
  { name: 'search_calendar',    description: 'Search upcoming calendar bookings', parameters: { query:{type:'string',description:'Search query'} } },
];

// ─── Dispatcher ───────────────────────────────────────────────────────────────

const TOOL_MAP: Record<string, (p: Record<string, unknown>, orgId: string) => Promise<ToolResult>> = {
  search_crm:         searchCrm,
  create_lead:        createLead,
  create_booking:     createBooking,
  create_task:        createTask,
  create_note:        createNote,
  search_knowledge:   searchKnowledge,
  run_workflow:       runWorkflow,
  dashboard_insights: getDashboardInsights,
  send_email:         sendEmail,
  search_calendar:    searchCalendar,
};

export async function executeTool(
  toolName:  string,
  params:    Record<string, unknown>,
  orgId:     string,
): Promise<ToolResult> {
  const fn = TOOL_MAP[toolName];
  if (!fn) return { tool: toolName, success: false, data: null, error: `Unknown tool: ${toolName}` };
  try {
    return await fn(params, orgId);
  } catch (e: any) {
    return { tool: toolName, success: false, data: null, error: e.message };
  }
}
