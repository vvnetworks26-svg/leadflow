import { BusinessSettings } from '../types';

/**
 * IBusinessSettingsRepository — contract for BusinessSettings persistence.
 * The entire settings object is stored and loaded as one document.
 */
export interface IBusinessSettingsRepository {
  load(): BusinessSettings | null;
  save(settings: BusinessSettings): void;
  clear(): void;
}
