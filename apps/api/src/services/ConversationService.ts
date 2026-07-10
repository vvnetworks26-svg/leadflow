import { ConversationModel } from '../models/Conversation.model';
import { ApiError } from '../middleware/errorHandler';
import { CreateConversationDto, UpdateConversationDto, ConversationQueryDto, AddMessageDto } from '../dto/conversation.dto';
import { Conversation, Message } from '../types';
import { PaginatedResult, paginated } from '../utils/query';

function makeId(): string {
  return `msg_${Math.random().toString(36).substr(2, 9)}`;
}

export const ConversationService = {
  async list(organizationId: string, q: ConversationQueryDto): Promise<PaginatedResult<Conversation>> {
    const page  = q.page  ?? 1;
    const limit = q.limit ?? 20;
    const skip  = (page - 1) * limit;

    const filter: Record<string, unknown> = { organizationId };
    if (q.status) filter.status = q.status;
    if (q.leadId) filter.leadId = q.leadId;
    if (q.search) {
      const re = new RegExp(q.search, 'i');
      filter.$or = [{ leadName: re }, { leadPhone: re }];
    }

    const sortField = q.sortBy ?? 'lastMessageAt';
    const sortOrder = q.order  === 'asc' ? 1 : -1;

    const [docs, total] = await Promise.all([
      ConversationModel.find(filter).sort({ [sortField]: sortOrder }).skip(skip).limit(limit),
      ConversationModel.countDocuments(filter),
    ]);

    return paginated(docs.map(d => d.toJSON() as unknown as Conversation), total, { page, limit, skip });
  },

  async getById(organizationId: string, id: string): Promise<Conversation> {
    const doc = await ConversationModel.findOne({ _id: id, organizationId });
    if (!doc) throw new ApiError(404, 'Conversation not found', 'CONVERSATION_NOT_FOUND');
    return doc.toJSON() as unknown as Conversation;
  },

  async create(organizationId: string, dto: CreateConversationDto): Promise<Conversation> {
    const doc = await ConversationModel.create({
      ...dto,
      organizationId,
      lastMessageAt: dto.lastMessageAt ?? new Date().toISOString(),
    });
    return doc.toJSON() as unknown as Conversation;
  },

  async update(organizationId: string, id: string, dto: UpdateConversationDto): Promise<Conversation> {
    const doc = await ConversationModel.findOneAndUpdate(
      { _id: id, organizationId },
      dto,
      { new: true, runValidators: true }
    );
    if (!doc) throw new ApiError(404, 'Conversation not found', 'CONVERSATION_NOT_FOUND');
    return doc.toJSON() as unknown as Conversation;
  },

  async addMessage(organizationId: string, id: string, dto: AddMessageDto): Promise<Message> {
    const doc = await ConversationModel.findOne({ _id: id, organizationId });
    if (!doc) throw new ApiError(404, 'Conversation not found', 'CONVERSATION_NOT_FOUND');

    const msg: Message = {
      id:        makeId(),
      sender:    dto.sender,
      text:      dto.text,
      timestamp: new Date().toISOString(),
    };

    doc.messages.push(msg as any);
    doc.lastMessageAt = msg.timestamp;
    await doc.save();
    return msg;
  },

  /** Count conversations for an organization. */
  async countByOrganization(organizationId: string): Promise<number> {
    return ConversationModel.countDocuments({ organizationId });
  },
};
