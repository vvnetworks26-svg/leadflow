import { Conversation } from '../types';
import { IConversationRepository } from './IConversationRepository';
import { ConversationModel } from '../models/Conversation.model';

function toPlain(doc: any): Conversation {
  const obj = doc.toJSON();
  return {
    ...obj,
    createdAt: obj.createdAt instanceof Date ? obj.createdAt.toISOString() : obj.createdAt,
    updatedAt: obj.updatedAt instanceof Date ? obj.updatedAt.toISOString() : obj.updatedAt,
  } as Conversation;
}

export class MongoConversationRepository implements IConversationRepository {
  async findAll(): Promise<Conversation[]> {
    const docs = await ConversationModel.find().sort({ lastMessageAt: -1 });
    return docs.map(toPlain);
  }

  async findById(id: string): Promise<Conversation | null> {
    const doc = await ConversationModel.findById(id);
    return doc ? toPlain(doc) : null;
  }

  async create(data: Omit<Conversation, 'id'>): Promise<Conversation> {
    const doc = await ConversationModel.create(data);
    return toPlain(doc);
  }

  async update(id: string, patch: Partial<Conversation>): Promise<Conversation | null> {
    const doc = await ConversationModel.findByIdAndUpdate(id, patch, { new: true });
    return doc ? toPlain(doc) : null;
  }
}
