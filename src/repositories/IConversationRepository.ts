import { Conversation } from '../types';

/**
 * IConversationRepository — contract for Conversation persistence.
 */
export interface IConversationRepository {
  findAll(): Conversation[];
  findById(id: string): Conversation | undefined;
  save(conversation: Conversation): void;
  saveAll(conversations: Conversation[]): void;
}
