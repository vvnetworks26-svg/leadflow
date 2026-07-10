/**
 * ExportService.ts
 *
 * Streams organization data as CSV for leads, bookings, conversations,
 * activities, tasks, and analytics. All exports are org-scoped.
 */

import { LeadModel }         from '../../models/Lead.model';
import { BookingModel }      from '../../models/Booking.model';
import { ConversationModel } from '../../models/Conversation.model';
import { ActivityModel }     from '../../models/Activity.model';
import { TaskModel }         from '../../models/Task.model';

export type ExportEntity = 'leads' | 'bookings' | 'conversations' | 'activities' | 'tasks';

function toCsvRow(obj: Record<string, unknown>): string {
  return Object.values(obj)
    .map(v => {
      const s = v === null || v === undefined ? '' : String(v);
      return `"${s.replace(/"/g, '""')}"`;
    })
    .join(',');
}

function buildCsv(headers: string[], rows: Record<string, unknown>[]): string {
  return [headers.join(','), ...rows.map(toCsvRow)].join('\n');
}

export const ExportService = {

  async exportLeads(organizationId: string, filters: Record<string, unknown> = {}): Promise<string> {
    const docs = await LeadModel.find({ organizationId, ...filters })
      .sort({ createdAt: -1 }).limit(10000).lean();
    const headers = ['id','name','email','phone','company','status','priority','temperature','score','source','value','estimatedValue','stageName','ownerId','tags','hvacNeed','notes','createdAt'];
    const rows = docs.map((d: any) => ({
      id: d._id, name: d.name, email: d.email, phone: d.phone,
      company: d.company ?? '', status: d.status, priority: d.priority,
      temperature: d.temperature ?? '', score: d.score ?? 0,
      source: d.source, value: d.value, estimatedValue: d.estimatedValue ?? 0,
      stageName: d.stageName ?? '', ownerId: d.ownerId ?? '',
      tags: (d.tags ?? []).join(';'), hvacNeed: d.hvacNeed, notes: d.notes,
      createdAt: d.createdAt?.toISOString() ?? '',
    }));
    return buildCsv(headers, rows);
  },

  async exportBookings(organizationId: string, filters: Record<string, unknown> = {}): Promise<string> {
    const docs = await BookingModel.find({ organizationId, ...filters })
      .sort({ startUtc: -1 }).limit(10000).lean();
    const headers = ['id','guestName','guestEmail','guestPhone','meetingType','status','startUtc','endUtc','durationMinutes','assigneeId','confirmationCode','leadId','notes','createdAt'];
    const rows = docs.map((d: any) => ({
      id: d._id, guestName: d.guestName, guestEmail: d.guestEmail, guestPhone: d.guestPhone,
      meetingType: d.meetingTypeName, status: d.status,
      startUtc: d.startUtc?.toISOString() ?? '', endUtc: d.endUtc?.toISOString() ?? '',
      durationMinutes: d.durationMinutes, assigneeId: d.assigneeId,
      confirmationCode: d.confirmationCode, leadId: d.leadId ?? '',
      notes: d.notes, createdAt: d.createdAt?.toISOString() ?? '',
    }));
    return buildCsv(headers, rows);
  },

  async exportConversations(organizationId: string): Promise<string> {
    const docs = await ConversationModel.find({ organizationId })
      .sort({ createdAt: -1 }).limit(5000).lean();
    const headers = ['id','leadName','leadPhone','leadEmail','status','messageCount','lastMessageAt','leadId','createdAt'];
    const rows = docs.map((d: any) => ({
      id: d._id, leadName: d.leadName, leadPhone: d.leadPhone, leadEmail: d.leadEmail ?? '',
      status: d.status, messageCount: d.messages?.length ?? 0, lastMessageAt: d.lastMessageAt,
      leadId: d.leadId ?? '', createdAt: d.createdAt?.toISOString() ?? '',
    }));
    return buildCsv(headers, rows);
  },

  async exportActivities(organizationId: string): Promise<string> {
    const docs = await ActivityModel.find({ organizationId })
      .sort({ createdAt: -1 }).limit(10000).lean();
    const headers = ['id','type','title','description','leadId','userId','createdAt'];
    const rows = docs.map((d: any) => ({
      id: d._id, type: d.type, title: d.title, description: d.description,
      leadId: d.leadId ?? '', userId: d.userId ?? '', createdAt: d.createdAt?.toISOString() ?? '',
    }));
    return buildCsv(headers, rows);
  },

  async exportTasks(organizationId: string): Promise<string> {
    const docs = await TaskModel.find({ organizationId })
      .sort({ dueDate: 1 }).limit(10000).lean();
    const headers = ['id','title','type','priority','status','leadId','ownerId','dueDate','completed','completedAt','createdAt'];
    const rows = docs.map((d: any) => ({
      id: d._id, title: d.title, type: d.type, priority: d.priority,
      status: d.completed ? 'completed' : 'pending', leadId: d.leadId ?? '', ownerId: d.ownerId ?? '',
      dueDate: d.dueDate?.toISOString() ?? '', completed: d.completed,
      completedAt: d.completedAt?.toISOString() ?? '', createdAt: d.createdAt?.toISOString() ?? '',
    }));
    return buildCsv(headers, rows);
  },

  async export(organizationId: string, entity: ExportEntity, filters?: Record<string, unknown>): Promise<{ csv: string; filename: string }> {
    let csv: string;
    switch (entity) {
      case 'leads':         csv = await ExportService.exportLeads(organizationId, filters); break;
      case 'bookings':      csv = await ExportService.exportBookings(organizationId, filters); break;
      case 'conversations': csv = await ExportService.exportConversations(organizationId); break;
      case 'activities':    csv = await ExportService.exportActivities(organizationId); break;
      case 'tasks':         csv = await ExportService.exportTasks(organizationId); break;
      default:              csv = ''; break;
    }
    const date     = new Date().toISOString().slice(0, 10);
    const filename = `leadflow-${entity}-${date}.csv`;
    return { csv, filename };
  },
};
