/**
 * InboxService.ts — Shared inbox management.
 * Thread CRUD, assignment, labeling, status, search, pagination.
 */

import { ConversationThreadModel, IConversationThread, ThreadStatus } from '../../models/ConversationThread.model';
import { CommunicationMessageModel } from '../../models/CommunicationMessage.model';
import { InboxRuleModel }           from '../../models/InboxRule.model';
import { ApiError }                 from '../../middleware/errorHandler';
import { PaginatedResult, paginated } from '../../utils/query';
import { broadcast }                from '../../dashboard/realtime/SseService';

export interface InboxQuery {
  status?:     ThreadStatus;
  assigneeId?: string;
  channel?:    string;
  label?:      string;
  search?:     string;
  unread?:     boolean;
  pinned?:     boolean;
  starred?:    boolean;
  page?:       number;
  limit?:      number;
}

export const InboxService = {

  async list(organizationId: string, q: InboxQuery): Promise<PaginatedResult<IConversationThread>> {
    const page  = q.page  ?? 1;
    const limit = q.limit ?? 30;
    const skip  = (page - 1) * limit;
    const filter: Record<string, unknown> = { organizationId, deletedAt: null };

    if (q.status)   filter.status     = q.status;
    if (q.assigneeId) filter.assigneeId = q.assigneeId;
    if (q.channel)  filter.channels   = q.channel;
    if (q.label)    filter.labels     = q.label;
    if (q.unread)   filter.unreadCount= { $gt: 0 };
    if (q.pinned)   filter.isPinned   = true;
    if (q.starred)  filter.isStarred  = true;
    if (q.search) {
      const re = new RegExp(q.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ subject: re }, { snippet: re }];
    }

    const [docs, total] = await Promise.all([
      ConversationThreadModel.find(filter).sort({ isPinned: -1, lastMessageAt: -1 }).skip(skip).limit(limit),
      ConversationThreadModel.countDocuments(filter),
    ]);
    return paginated(docs.map(d => d.toJSON() as unknown as IConversationThread), total, { page, limit, skip });
  },

  async getById(organizationId: string, id: string): Promise<IConversationThread> {
    const doc = await ConversationThreadModel.findOne({ _id: id, organizationId, deletedAt: null });
    if (!doc) throw new ApiError(404, 'Thread not found', 'THREAD_NOT_FOUND');
    return doc.toJSON() as unknown as IConversationThread;
  },

  async create(organizationId: string, data: Partial<IConversationThread>): Promise<IConversationThread> {
    const doc = await ConversationThreadModel.create({ ...data, organizationId });
    const thread = doc.toJSON() as unknown as IConversationThread;
    // Apply inbox rules
    InboxService._applyRules(organizationId, thread).catch(() => {});
    return thread;
  },

  async assign(organizationId: string, id: string, assigneeId: string | null, userId: string): Promise<IConversationThread> {
    const doc = await ConversationThreadModel.findOneAndUpdate(
      { _id: id, organizationId },
      { assigneeId },
      { new: true }
    );
    if (!doc) throw new ApiError(404, 'Thread not found', 'THREAD_NOT_FOUND');
    broadcast(organizationId, 'lead_created', { event: 'thread_assigned', threadId: id, assigneeId, by: userId });
    return doc.toJSON() as unknown as IConversationThread;
  },

  async updateStatus(organizationId: string, id: string, status: ThreadStatus, userId: string): Promise<IConversationThread> {
    const patch: Record<string, unknown> = { status };
    if (status === 'resolved') { patch.resolvedAt = new Date(); patch.resolvedById = userId; }
    const doc = await ConversationThreadModel.findOneAndUpdate(
      { _id: id, organizationId }, patch, { new: true }
    );
    if (!doc) throw new ApiError(404, 'Thread not found', 'THREAD_NOT_FOUND');
    return doc.toJSON() as unknown as IConversationThread;
  },

  async addLabel(organizationId: string, id: string, label: string): Promise<IConversationThread> {
    const doc = await ConversationThreadModel.findOneAndUpdate(
      { _id: id, organizationId }, { $addToSet: { labels: label } }, { new: true }
    );
    if (!doc) throw new ApiError(404, 'Thread not found', 'THREAD_NOT_FOUND');
    return doc.toJSON() as unknown as IConversationThread;
  },

  async removeLabel(organizationId: string, id: string, label: string): Promise<IConversationThread> {
    const doc = await ConversationThreadModel.findOneAndUpdate(
      { _id: id, organizationId }, { $pull: { labels: label } }, { new: true }
    );
    if (!doc) throw new ApiError(404, 'Thread not found', 'THREAD_NOT_FOUND');
    return doc.toJSON() as unknown as IConversationThread;
  },

  async togglePin(organizationId: string, id: string, pinned: boolean): Promise<IConversationThread> {
    const doc = await ConversationThreadModel.findOneAndUpdate(
      { _id: id, organizationId }, { isPinned: pinned }, { new: true }
    );
    if (!doc) throw new ApiError(404, 'Thread not found', 'THREAD_NOT_FOUND');
    return doc.toJSON() as unknown as IConversationThread;
  },

  async toggleStar(organizationId: string, id: string, starred: boolean): Promise<IConversationThread> {
    const doc = await ConversationThreadModel.findOneAndUpdate(
      { _id: id, organizationId }, { isStarred: starred }, { new: true }
    );
    if (!doc) throw new ApiError(404, 'Thread not found', 'THREAD_NOT_FOUND');
    return doc.toJSON() as unknown as IConversationThread;
  },

  async softDelete(organizationId: string, id: string): Promise<void> {
    await ConversationThreadModel.findOneAndUpdate({ _id: id, organizationId }, { deletedAt: new Date() });
  },

  /** Get messages for a thread (timeline). */
  async getTimeline(organizationId: string, threadId: string, page = 1, limit = 50): Promise<PaginatedResult<any>> {
    const skip = (page - 1) * limit;
    const filter = { organizationId, threadId, deletedAt: null };
    const [docs, total] = await Promise.all([
      CommunicationMessageModel.find(filter).sort({ createdAt: 1 }).skip(skip).limit(limit),
      CommunicationMessageModel.countDocuments(filter),
    ]);
    return paginated(docs.map(d => d.toJSON()), total, { page, limit, skip });
  },

  /** Mark thread messages as read. */
  async markRead(organizationId: string, threadId: string): Promise<void> {
    await CommunicationMessageModel.updateMany(
      { organizationId, threadId, isRead: false }, { isRead: true, readAt: new Date() }
    );
    await ConversationThreadModel.findOneAndUpdate({ _id: threadId, organizationId }, { unreadCount: 0 });
  },

  /** Apply inbox rules to a new thread. */
  async _applyRules(organizationId: string, thread: IConversationThread): Promise<void> {
    const rules = await InboxRuleModel.find({ organizationId, isActive: true }).sort({ priority: -1 }).lean();
    for (const rule of rules) {
      for (const action of (rule.actions as any[])) {
        switch (action.type) {
          case 'assign':
            if (action.params.assigneeId) {
              await ConversationThreadModel.findByIdAndUpdate(thread.id, { assigneeId: action.params.assigneeId });
            }
            break;
          case 'label':
            if (action.params.label) {
              await ConversationThreadModel.findByIdAndUpdate(thread.id, { $addToSet: { labels: action.params.label } });
            }
            break;
          case 'priority':
            await ConversationThreadModel.findByIdAndUpdate(thread.id, { priority: action.params.priority });
            break;
        }
      }
      await InboxRuleModel.findByIdAndUpdate(rule._id, { $inc: { runCount: 1 } });
    }
  },
};
