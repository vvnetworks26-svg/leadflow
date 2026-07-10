/**
 * ComplianceService.ts — GDPR/CCPA compliance records, consent, data export, right to delete.
 */

import { ComplianceRecordModel }  from '../../models/ComplianceRecord.model';
import { LeadModel }              from '../../models/Lead.model';
import { ConversationModel }      from '../../models/Conversation.model';
import { BookingModel }           from '../../models/Booking.model';
import { NotificationModel }      from '../../models/Notification.model';
import type { ComplianceEventType } from '../../models/ComplianceRecord.model';

export const ComplianceService = {

  async log(
    organizationId: string,
    eventType:      ComplianceEventType,
    data: {
      userId?:    string;
      leadId?:    string;
      ipAddress?: string;
      userAgent?: string;
      details?:   Record<string, unknown>;
      regulation?:'GDPR' | 'CCPA' | 'HIPAA' | 'SOC2' | 'GENERAL';
    }
  ): Promise<void> {
    await ComplianceRecordModel.create({
      organizationId,
      eventType,
      userId:     data.userId    ?? null,
      leadId:     data.leadId    ?? null,
      ipAddress:  data.ipAddress ?? '',
      userAgent:  data.userAgent ?? '',
      details:    data.details   ?? {},
      regulation: data.regulation ?? 'GENERAL',
    });
  },

  async list(organizationId: string, limit = 100): Promise<any[]> {
    return ComplianceRecordModel.find({ organizationId }).sort({ createdAt: -1 }).limit(limit).lean();
  },

  /** Export all data for a lead/user (GDPR Article 20 — right to portability). */
  async exportLeadData(organizationId: string, leadId: string): Promise<Record<string, unknown>> {
    const [lead, conversations, bookings, notifications, complianceLogs] = await Promise.all([
      LeadModel.findOne({ _id: leadId, organizationId }).lean(),
      ConversationModel.find({ organizationId, leadId }).lean(),
      BookingModel.find({ organizationId, leadId }).lean(),
      NotificationModel.find({ organizationId }).lean(),
      ComplianceRecordModel.find({ organizationId, leadId }).lean(),
    ]);

    await ComplianceService.log(organizationId, 'data_export_requested', { leadId });

    return {
      exportedAt:    new Date().toISOString(),
      organizationId,
      lead,
      conversations,
      bookings,
      notificationCount: notifications.length,
      complianceLogs,
    };
  },

  /** Delete all personal data for a lead (GDPR Article 17 — right to be forgotten). */
  async deleteLeadData(organizationId: string, leadId: string, requestedById: string): Promise<{ deleted: string[] }> {
    const deleted: string[] = [];

    // Anonymize lead PII
    const lead = await LeadModel.findOne({ _id: leadId, organizationId });
    if (lead) {
      await LeadModel.findByIdAndUpdate(leadId, {
        name:  '[DELETED]', email: '', phone: '', address: '',
        notes: '[Personal data deleted per right-to-be-forgotten request]',
      });
      deleted.push('lead_pii');
    }

    // Delete conversations
    const convResult = await ConversationModel.deleteMany({ organizationId, leadId });
    if (convResult.deletedCount > 0) deleted.push(`conversations:${convResult.deletedCount}`);

    // Log the deletion
    await ComplianceService.log(organizationId, 'data_deleted', {
      leadId, userId: requestedById,
      details: { deleted },
      regulation: 'GDPR',
    });

    return { deleted };
  },

  /** Generate a GDPR-compliant data retention report. */
  async getRetentionReport(organizationId: string): Promise<Record<string, number>> {
    const now       = new Date();
    const thirtyDays = new Date(now.getTime() - 30  * 86400_000);
    const ninetyDays = new Date(now.getTime() - 90  * 86400_000);
    const yearOld    = new Date(now.getTime() - 365 * 86400_000);

    const [totalLeads, oldLeads, totalConvs, oldConvs, totalBookings] = await Promise.all([
      LeadModel.countDocuments({ organizationId }),
      LeadModel.countDocuments({ organizationId, updatedAt: { $lt: ninetyDays } }),
      ConversationModel.countDocuments({ organizationId }),
      ConversationModel.countDocuments({ organizationId, createdAt: { $lt: yearOld } }),
      BookingModel.countDocuments({ organizationId }),
    ]);

    return { totalLeads, oldLeads, totalConvs, oldConvs, totalBookings };
  },
};
