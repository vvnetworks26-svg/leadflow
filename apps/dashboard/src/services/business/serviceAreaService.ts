/**
 * serviceAreaService.ts
 *
 * Manages the list of ZIP codes that define the business service area.
 * The qualification engine (qualification.ts) reads businessSettings
 * directly, so any save() call here is immediately reflected in lead
 * qualification — no restart required.
 *
 * Replace the load/save calls with API requests when a real backend arrives.
 */

import { businessSettings, DEFAULT_BUSINESS_SETTINGS } from './businessSettings';

export interface ServiceAreaConfig {
  zips: string[];
  enabled: boolean;
}

// ─── Validation ───────────────────────────────────────────────────────────────

/** Returns true if the string is a valid 5-digit US ZIP code. */
export function isValidZip(value: string): boolean {
  return /^\d{5}$/.test(value.trim());
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const serviceAreaService = {
  /** Load the current service area config. */
  load(): ServiceAreaConfig {
    const s = businessSettings.get();
    return { zips: [...s.serviceAreaZips], enabled: s.serviceAreaEnabled };
  },

  /** Persist the full service area config. */
  save(config: ServiceAreaConfig): ServiceAreaConfig {
    businessSettings.updateServiceArea(config.zips, config.enabled);
    return config;
  },

  /**
   * Add a single ZIP code. Silently ignores duplicates and invalid formats.
   * Returns the updated config.
   */
  addZip(zip: string): ServiceAreaConfig {
    const trimmed = zip.trim();
    if (!isValidZip(trimmed)) return serviceAreaService.load();
    const current = serviceAreaService.load();
    if (current.zips.includes(trimmed)) return current;
    const updated = { ...current, zips: [...current.zips, trimmed].sort() };
    return serviceAreaService.save(updated);
  },

  /**
   * Remove a single ZIP code.
   * Returns the updated config.
   */
  removeZip(zip: string): ServiceAreaConfig {
    const current = serviceAreaService.load();
    const updated = { ...current, zips: current.zips.filter(z => z !== zip) };
    return serviceAreaService.save(updated);
  },

  /**
   * Enable or disable service area validation.
   * When disabled, all ZIP codes are accepted by the qualification engine.
   */
  setEnabled(enabled: boolean): ServiceAreaConfig {
    const current = serviceAreaService.load();
    const updated = { ...current, enabled };
    return serviceAreaService.save(updated);
  },

  /** The factory-default service area, useful for resetting. */
  defaults(): ServiceAreaConfig {
    return {
      zips: [...DEFAULT_BUSINESS_SETTINGS.serviceAreaZips],
      enabled: DEFAULT_BUSINESS_SETTINGS.serviceAreaEnabled
    };
  }
};
