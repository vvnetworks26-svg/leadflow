/**
 * businessServicesService.ts
 *
 * Manages the catalogue of HVAC services the business offers.
 * The conversation engine (chat.ts) reads businessSettings.services
 * directly, so any save() call here is immediately reflected in the
 * AI's service list — no restart required.
 *
 * Replace the load/save calls with API requests when a real backend arrives.
 */

import { ServiceItem } from '../../types';
import { businessSettings, DEFAULT_BUSINESS_SETTINGS } from './businessSettings';

function makeId(): string {
  return `svc_${Math.random().toString(36).substr(2, 9)}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const businessServicesService = {
  /** Load the current services catalogue. */
  load(): ServiceItem[] {
    return businessSettings.get().services;
  },

  /** Persist the full services list. */
  save(services: ServiceItem[]): ServiceItem[] {
    businessSettings.updateServices(services);
    return services;
  },

  /**
   * Add a new service with generated id.
   * Returns the full updated list.
   */
  add(data: Omit<ServiceItem, 'id'>): ServiceItem[] {
    const current = businessServicesService.load();
    const newItem: ServiceItem = { ...data, id: makeId() };
    return businessServicesService.save([...current, newItem]);
  },

  /**
   * Update an existing service by id.
   * Returns the full updated list.
   */
  update(id: string, patch: Partial<Omit<ServiceItem, 'id'>>): ServiceItem[] {
    const current = businessServicesService.load();
    const updated = current.map(s => s.id === id ? { ...s, ...patch } : s);
    return businessServicesService.save(updated);
  },

  /**
   * Remove a service by id.
   * Returns the full updated list.
   */
  remove(id: string): ServiceItem[] {
    const current = businessServicesService.load();
    return businessServicesService.save(current.filter(s => s.id !== id));
  },

  /**
   * Toggle the active flag for a single service.
   * Returns the full updated list.
   */
  toggleActive(id: string): ServiceItem[] {
    const current = businessServicesService.load();
    const updated = current.map(s => s.id === id ? { ...s, active: !s.active } : s);
    return businessServicesService.save(updated);
  },

  /** The factory-default services, useful for a reset action. */
  defaults(): ServiceItem[] {
    return DEFAULT_BUSINESS_SETTINGS.services;
  }
};
