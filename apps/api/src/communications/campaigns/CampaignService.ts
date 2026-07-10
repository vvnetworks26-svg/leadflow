/**
 * CampaignService.ts — Bulk messaging campaign engine.
 */

import { CampaignModel, ICampaign } from '../../models/Campaign.model';
import { LeadModel }                from '../../models/Lead.model';
import { MessageService }           from '../inbox/MessageService';
import { ConversationThreadModel }  from '../../models/ConversationThread.model';
import { ApiError }                 from '../../middleware/errorHandler';
import { renderTemplate }           from '../templates/TemplateEngine';
import { logger }                   from '../../utils/logger';
import { PaginatedResult, paginated } from '../../utils/query';

export const CampaignService = {

  async list(organizationId: string, page = 1, limit = 20): Promise<PaginatedResult<ICampaign>> {
    const skip = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      CampaignModel.find({ organizationId }).sort({ createdAt: -1 }).skip(skip).limit(limit),
      CampaignModel.countDocuments({ organizationId }),
    ]);
    return paginated(docs.map(d => d.toJSON() as unknown as ICampaign), total, { page, limit, skip });
  },

  async getById(organizationId: string, id: string): Promise<ICampaign> {
    const doc = await CampaignModel.findOne({ _id: id, organizationId });
    if (!doc) throw new ApiError(404, 'Campaign not found', 'CAMPAIGN_NOT_FOUND');
    return doc.toJSON() as unknown as ICampaign;
  },

  async create(organizationId: string, userId: string, data: Partial<ICampaign>): Promise<ICampaign> {
    const doc = await CampaignModel.create({ ...data, organizationId, createdById: userId });
    return doc.toJSON() as unknown as ICampaign;
  },

  async update(organizationId: string, id: string, data: Partial<ICampaign>): Promise<ICampaign> {
    const doc = await CampaignModel.findOneAndUpdate(
      { _id: id, organizationId, status: { $in: ['draft','paused'] } }, data, { new: true }
    );
    if (!doc) throw new ApiError(400, 'Campaign not found or not editable', 'CAMPAIGN_NOT_EDITABLE');
    return doc.toJSON() as unknown as ICampaign;
  },

  async delete(organizationId: string, id: string): Promise<void> {
    await CampaignModel.findOneAndUpdate(
      { _id: id, organizationId }, { status: 'cancelled' }
    );
  },

  /** Launch a campaign — resolves audience and sends messages. */
  async send(organizationId: string, id: string): Promise<ICampaign> {
    const campaign = await CampaignModel.findOne({ _id: id, organizationId });
    if (!campaign) throw new ApiError(404, 'Campaign not found', 'CAMPAIGN_NOT_FOUND');
    if (!['draft','paused'].includes(campaign.status)) {
      throw new ApiError(400, 'Campaign already sent or cancelled', 'INVALID_STATUS');
    }

    await CampaignModel.findByIdAndUpdate(id, { status: 'sending', startedAt: new Date() });

    // Resolve recipients
    const audience = campaign.audience as any;
    let recipients: Array<{ address: string; name: string; leadId: string }> = [];

    if (audience.type === 'all') {
      const leads = await LeadModel.find({
        organizationId,
        ...(campaign.channel === 'email' ? { email: { $ne: '' } } : { phone: { $ne: '' } }),
      }).limit(10000).lean();
      recipients = leads.map((l: any) => ({
        address: campaign.channel === 'email' ? l.email : l.phone,
        name:    l.name,
        leadId:  l._id.toString(),
      }));
    } else if (audience.type === 'filter' && audience.filters) {
      const leads = await LeadModel.find({ organizationId, ...audience.filters }).limit(10000).lean();
      recipients = leads.map((l: any) => ({
        address: campaign.channel === 'email' ? l.email : l.phone,
        name:    l.name,
        leadId:  l._id.toString(),
      }));
    }

    // Remove suppressed addresses
    const suppressed = new Set(campaign.suppressionList ?? []);
    recipients = recipients.filter(r => r.address && !suppressed.has(r.address));

    await CampaignModel.findByIdAndUpdate(id, { 'stats.total': recipients.length });

    // Send in batches of 50 (non-blocking)
    CampaignService._sendBatch(organizationId, campaign._id.toString(), campaign, recipients)
      .catch(err => logger.warn({ err, campaignId: id }, '[Campaign] batch send error'));

    return (await CampaignModel.findById(id))!.toJSON() as unknown as ICampaign;
  },

  async _sendBatch(
    organizationId: string,
    campaignId:     string,
    campaign:       any,
    recipients:     Array<{ address: string; name: string; leadId: string }>,
  ): Promise<void> {
    let sent = 0, failed = 0;

    for (const r of recipients) {
      try {
        let body = campaign.body;
        if (campaign.templateId) {
          const rendered = renderTemplate(body, { name: r.name, address: r.address });
          body = rendered;
        }

        // Find or create thread for this lead
        const existingThread = await ConversationThreadModel.findOne({ organizationId, leadId: r.leadId }).lean();
        let threadId: string;
        if (existingThread) {
          threadId = (existingThread._id as any).toString();
        } else {
          const newThread = await ConversationThreadModel.create({
            organizationId, leadId: r.leadId, channels: [campaign.channel],
            subject: campaign.subject || 'Campaign', snippet: body.slice(0, 100), status: 'open',
          });
          threadId = newThread._id.toString();
        }

        await MessageService.send({
          organizationId,
          threadId,
          channel:   campaign.channel,
          direction: 'outbound',
          from:      'campaign',
          to:        r.address,
          subject:   campaign.subject,
          body,
        });
        sent++;
      } catch (err) {
        failed++;
        logger.warn({ err, to: r.address }, '[Campaign] individual send failed');
      }

      // Rate limiting: 10 messages/second
      if (sent % 10 === 0) await new Promise(resolve => setTimeout(resolve, 1000));
    }

    await CampaignModel.findByIdAndUpdate(campaignId, {
      status:       'sent',
      completedAt:  new Date(),
      'stats.sent':  sent,
      'stats.failed':failed,
    });
  },

  async pause(organizationId: string, id: string): Promise<ICampaign> {
    const doc = await CampaignModel.findOneAndUpdate(
      { _id: id, organizationId, status: 'sending' }, { status: 'paused' }, { new: true }
    );
    if (!doc) throw new ApiError(400, 'Campaign cannot be paused', 'INVALID_STATUS');
    return doc.toJSON() as unknown as ICampaign;
  },
};
