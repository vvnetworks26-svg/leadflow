import { BusinessSettings } from '../types';
import { IBusinessSettingsRepository } from './IBusinessSettingsRepository';

const STORAGE_KEY = 'leadflow_business_settings';

/**
 * LocalBusinessSettingsRepository
 *
 * Persists the full BusinessSettings document to localStorage.
 * Returns null on load when the key is absent so the caller can
 * seed defaults — keeping the default-data concern in the service layer.
 */
export class LocalBusinessSettingsRepository implements IBusinessSettingsRepository {
  load(): BusinessSettings | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as BusinessSettings;
    } catch {
      return null;
    }
  }

  save(settings: BusinessSettings): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
  }
}

/** Singleton instance used by businessSettings service. */
export const businessSettingsRepository: IBusinessSettingsRepository =
  new LocalBusinessSettingsRepository();
