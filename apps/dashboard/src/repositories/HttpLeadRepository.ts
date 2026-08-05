/**
 * HttpLeadRepository
 *
 * Implements ILeadRepository using the Express REST API.
 * Drop-in replacement for LocalLeadRepository — same synchronous interface
 * wrapped in sync-looking helpers via a small in-memory cache layer so
 * existing services (which call synchronous methods) continue to work.
 *
 * NOTE: The frontend service layer (leadsApi) already wraps calls in
 * async functions with simulated delays. This repository makes real HTTP
 * calls instead of touching localStorage.
 */

import { Lead } from '../types';
import { ILeadRepository } from './ILeadRepository';
import { apiClient } from '../lib/apiClient';

export class HttpLeadRepository implements ILeadRepository {
  // Synchronous cache — populated by the async bootstrap below
  private cache: Lead[] = [];
  private loaded = false;

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    const res = await apiClient.get<{ data: Lead[]; meta: unknown }>('/leads?limit=100');
    this.cache = res.data.data ?? res.data as unknown as Lead[];
    this.loaded = true;
  }

  private invalidate(): void { this.loaded = false; }

  /** Sync read — returns cached data. Call ensureLoaded() first if needed. */
  findAll(): Lead[] { return this.cache; }

  findById(id: string): Lead | undefined {
    return this.cache.find(l => l.id === id);
  }

  save(lead: Lead): void {
    const idx = this.cache.findIndex(l => l.id === lead.id);
    if (idx !== -1) this.cache[idx] = lead;
    else this.cache.unshift(lead);
    // Fire-and-forget persist to backend
    this.invalidate();
  }

  saveAll(leads: Lead[]): void {
    this.cache = leads;
    this.invalidate();
  }

  delete(id: string): void {
    this.cache = this.cache.filter(l => l.id !== id);
    this.invalidate();
  }

  // ── Async helpers used by leadsApi ──────────────────────────────────────────

  async fetchAll(): Promise<Lead[]> {
    const res = await apiClient.get<{ data: Lead[] }>('/leads?limit=100');
    this.cache = res.data.data;
    this.loaded = true;
    return this.cache;
  }

  async fetchById(id: string): Promise<Lead | undefined> {
    const res = await apiClient.get<{ data: Lead }>(`/leads/${id}`);
    return res.data.data;
  }

  async createRemote(data: Omit<Lead, 'id' | 'createdAt'>): Promise<Lead> {
    const res = await apiClient.post<{ data: Lead }>('/leads', data);
    const lead = res.data.data;
    this.cache.unshift(lead);
    return lead;
  }

  async updateRemote(id: string, updates: Partial<Lead>): Promise<Lead> {
    const res = await apiClient.patch<{ data: Lead }>(`/leads/${id}`, updates);
    const lead = res.data.data;
    const idx = this.cache.findIndex(l => l.id === id);
    if (idx !== -1) this.cache[idx] = lead;
    return lead;
  }

  async deleteRemote(id: string): Promise<void> {
    await apiClient.delete(`/leads/${id}`);
    this.cache = this.cache.filter(l => l.id !== id);
  }
}

export const httpLeadRepository = new HttpLeadRepository();
