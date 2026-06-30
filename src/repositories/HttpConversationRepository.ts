import { Conversation } from '../types';
import { IConversationRepository } from './IConversationRepository';
import { apiClient } from '../lib/apiClient';

export class HttpConversationRepository implements IConversationRepository {
  private cache: Conversation[] = [];
  private loaded = false;

  private invalidate(): void { this.loaded = false; }

  findAll(): Conversation[] { return this.cache; }

  findById(id: string): Conversation | undefined {
    return this.cache.find(c => c.id === id);
  }

  save(conversation: Conversation): void {
    const idx = this.cache.findIndex(c => c.id === conversation.id);
    if (idx !== -1) this.cache[idx] = conversation;
    else this.cache.unshift(conversation);
    this.invalidate();
  }

  saveAll(conversations: Conversation[]): void {
    this.cache = conversations;
    this.invalidate();
  }

  async fetchAll(): Promise<Conversation[]> {
    const res = await apiClient.get<{ data: Conversation[] }>('/conversations?limit=200');
    this.cache = res.data.data;
    this.loaded = true;
    return this.cache;
  }

  async fetchById(id: string): Promise<Conversation | undefined> {
    const res = await apiClient.get<{ data: Conversation }>(`/conversations/${id}`);
    return res.data.data;
  }

  async createRemote(data: Omit<Conversation, 'id'>): Promise<Conversation> {
    const res = await apiClient.post<{ data: Conversation }>('/conversations', data);
    const conv = res.data.data;
    this.cache.unshift(conv);
    return conv;
  }

  async updateRemote(id: string, updates: Partial<Conversation>): Promise<Conversation> {
    const res = await apiClient.patch<{ data: Conversation }>(`/conversations/${id}`, updates);
    const conv = res.data.data;
    const idx = this.cache.findIndex(c => c.id === id);
    if (idx !== -1) this.cache[idx] = conv;
    return conv;
  }
}

export const httpConversationRepository = new HttpConversationRepository();
