import { Lead } from '../../types';
import { httpLeadRepository } from '../../repositories/HttpLeadRepository';

/**
 * leadsApi — Lead business logic.
 * Delegates persistence to httpLeadRepository (Express REST API).
 * Falls back gracefully if the backend is unavailable.
 */
export const leadsApi = {
  getAll: async (): Promise<Lead[]> => {
    try {
      return await httpLeadRepository.fetchAll();
    } catch {
      return httpLeadRepository.findAll();
    }
  },

  getById: async (id: string): Promise<Lead | undefined> => {
    try {
      return await httpLeadRepository.fetchById(id);
    } catch {
      return httpLeadRepository.findById(id);
    }
  },

  create: async (data: Omit<Lead, 'id' | 'createdAt'>): Promise<Lead> => {
    await new Promise(r => setTimeout(r, 200));
    return httpLeadRepository.createRemote(data);
  },

  update: async (id: string, updates: Partial<Lead>): Promise<Lead> => {
    await new Promise(r => setTimeout(r, 200));
    const lead = await httpLeadRepository.updateRemote(id, updates);
    return lead;
  },

  delete: async (id: string): Promise<void> => {
    await new Promise(r => setTimeout(r, 200));
    return httpLeadRepository.deleteRemote(id);
  }
};
