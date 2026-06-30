import { ConversationModel } from '../models/Conversation.model';
import { ApiError } from '../middleware/errorHandler';
import { CreateConversationDto, UpdateConversationDto, ConversationQueryDto, AddMessageDto } from '../dto/conversation.dto';
import { Conversation, Message } from '../types';
import { PaginatedResult, paginated } from '../utils/query';

function makeId(): string {
  return `msg_${Math.random().toString(36).substr(2, 9)}`;
}

export const ConversationService = {
  async list(q: ConversationQueryDto): Promise<PaginatedResult<Conversation>> {
    const page  = q.page  ?? 1;
    const limit = q.limit ?? 20;
    const skip  = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
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

  async getById(id: string): Promise<Conversation> {
    const doc = await ConversationModel.findById(id);
    if (!doc) throw new ApiError(404, 'Conversation not found', 'CONVERSATION_NOT_FOUND');
    return doc.toJSON() as unknown as Conversation;
  },

  async create(dto: CreateConversationDto): Promise<Conversation> {
    const doc = await ConversationModel.create({
      ...dto,
      lastMessageAt: dto.lastMessageAt ?? new Date().toISOString(),
    });
    return doc.toJSON() as unknown as Conversation;
  },

  async update(id: string, dto: UpdateConversationDto): Promise<Conversation> {
    const doc = await ConversationModel.findByIdAndUpdate(id, dto, { new: true, runValidators: true });
    if (!doc) throw new ApiError(404, 'Conversation not found', 'CONVERSATION_NOT_FOUND');
    return doc.toJSON() as unknown as Conversation;
  },

  async addMessage(id: string, dto: AddMessageDto): Promise<Message> {
    const doc = await ConversationModel.findById(id);
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
};
