import { Conversation } from '../types';

export interface IConversationRepository {
  findAll(): Promise<Conversation[]>;
  findById(id: string): Promise<Conversation | null>;
  create(data: Omit<Conversation, 'id'>): Promise<Conversation>;
  update(id: string, patch: Partial<Conversation>): Promise<Conversation | null>;
}
