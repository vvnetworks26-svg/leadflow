import { Lead } from '../types';

/**
 * ILeadRepository (async) — API-layer contract for Lead persistence.
 * Async because both MongoDB and future REST adapters are inherently async.
 */
export interface ILeadRepository {
  findAll(): Promise<Lead[]>;
  findById(id: string): Promise<Lead | null>;
  create(data: Omit<Lead, 'id' | 'createdAt'>): Promise<Lead>;
  update(id: string, patch: Partial<Lead>): Promise<Lead | null>;
  delete(id: string): Promise<void>;
}
