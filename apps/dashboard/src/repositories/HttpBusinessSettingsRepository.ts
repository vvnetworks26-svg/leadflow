import { BusinessSettings } from '../types';
import { IBusinessSettingsRepository } from './IBusinessSettingsRepository';
import { apiClient } from '../lib/apiClient';

export class HttpBusinessSettingsRepository implements IBusinessSettingsRepository {
  private cache: BusinessSettings | null = null;

  load(): BusinessSettings | null {
    return this.cache;
  }

  save(settings: BusinessSettings): void {
    this.cache = settings;
    // Fire-and-forget to backend
    apiClient.put('/business', settings).catch(console.error);
  }

  clear(): void {
    this.cache = null;
  }

  async fetchRemote(): Promise<BusinessSettings | null> {
    try {
      const res = await apiClient.get<{ data: BusinessSettings }>('/business');
      this.cache = res.data.data;
      return this.cache;
    } catch {
      return null;
    }
  }

  async saveRemote(settings: BusinessSettings): Promise<BusinessSettings> {
    const res = await apiClient.put<{ data: BusinessSettings }>('/business', settings);
    this.cache = res.data.data;
    return this.cache;
  }
}

export const httpBusinessSettingsRepository = new HttpBusinessSettingsRepository();
