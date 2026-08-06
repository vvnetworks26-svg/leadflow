import { Conversation, Message } from '../../types';
import { httpConversationRepository } from '../../repositories/HttpConversationRepository';

/**
 * conversationsApi — Conversation business logic.
 * Delegates persistence to httpConversationRepository (Express REST API).
 */
export const conversationsApi = {
  getAll: async (): Promise<Conversation[]> => {
    try {
      return await httpConversationRepository.fetchAll();
    } catch {
      return httpConversationRepository.findAll();
    }
  },

  getById: async (id: string): Promise<Conversation | undefined> => {
    try {
      return await httpConversationRepository.fetchById(id);
    } catch {
      return httpConversationRepository.findById(id);
    }
  },

  create: async (data: Omit<Conversation, 'id'>): Promise<Conversation> => {
    await new Promise(r => setTimeout(r, 200));
    return httpConversationRepository.createRemote(data);
  },

  updateStatus: async (
    id: string,
    status: 'active' | 'archived' | 'snoozed' | 'completed'
  ): Promise<Conversation> => {
    const updated = await httpConversationRepository.updateRemote(id, { status });
    if (!updated) throw new Error('Conversation not found');
    return updated;
  },

  linkLead: async (id: string, leadId: string): Promise<Conversation> => {
    const updated = await httpConversationRepository.updateRemote(id, { leadId, status: 'completed' });
    if (!updated) throw new Error('Conversation not found');
    return updated;
  },

  addMessage: async (
    convId: string,
    sender: 'ai' | 'user' | 'agent',
    text: string
  ): Promise<Message> => {
    const conv = httpConversationRepository.findById(convId);
    const msg: Message = {
      id: `msg_${Math.random().toString(36).substr(2, 9)}`,
      sender,
      text,
      timestamp: new Date().toISOString()
    };
    const messages = [...(conv?.messages ?? []), msg];
    await httpConversationRepository.updateRemote(convId, {
      messages,
      lastMessageAt: msg.timestamp
    });
    return msg;
  },

  getOrCreate: async (
    name: string,
    phone: string,
    email?: string
  ): Promise<Conversation> => {
    const all = httpConversationRepository.findAll();
    const existing = all.find(c => c.leadPhone === phone && c.status === 'active');
    if (existing) return existing;
    return httpConversationRepository.createRemote({
      leadName: name,
      leadPhone: phone,
      leadEmail: email,
      messages: [],
      status: 'active',
      lastMessageAt: new Date().toISOString()
    });
  }
};
