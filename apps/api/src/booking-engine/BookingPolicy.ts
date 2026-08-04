/**
 * booking-engine/BookingPolicy.ts
 *
 * Encapsulates all booking policy rules derived from BusinessIdentity.
 * Pure rule evaluation — no I/O.
 */

import type { BusinessIdentity, ServiceCatalogItem } from '../business-identity/types';

export interface PolicyCheckResult {
  readonly allowed: boolean;
  readonly reason?: string;
}

export const BookingPolicy = {

  /**
   * Can the AI perform a booking for this business?
   */
  canBook(identity: BusinessIdentity): PolicyCheckResult {
    if (!identity.permissions.allowed.includes('book_appointment')) {
      return { allowed: false, reason: 'book_appointment permission not granted.' };
    }
    return { allowed: true };
  },

  /**
   * Can the AI reschedule for this business?
   */
  canReschedule(identity: BusinessIdentity): PolicyCheckResult {
    if (!identity.permissions.allowed.includes('reschedule_appointment')) {
      return { allowed: false, reason: 'reschedule_appointment permission not granted.' };
    }
    return { allowed: true };
  },

  /**
   * Can the AI cancel for this business?
   */
  canCancel(identity: BusinessIdentity): PolicyCheckResult {
    if (!identity.permissions.allowed.includes('cancel_appointment')) {
      return { allowed: false, reason: 'cancel_appointment permission not granted.' };
    }
    return { allowed: true };
  },

  /**
   * Is the requested service bookable?
   */
  isServiceBookable(identity: BusinessIdentity, serviceNameOrId: string): PolicyCheckResult {
    const catalog = identity.servicesCatalog;
    if (catalog.length === 0) {
      // No catalog defined — allow any service
      return { allowed: true };
    }

    const item = catalog.find(
      s => s.id === serviceNameOrId ||
           s.name.toLowerCase() === serviceNameOrId.toLowerCase()
    );

    if (!item) {
      // Not in catalog — still allowed (catalog is informational, not restrictive)
      return { allowed: true };
    }

    if (!item.enabled) {
      return { allowed: false, reason: `Service "${item.name}" is currently disabled.` };
    }

    if (!item.bookable) {
      return { allowed: false, reason: `Service "${item.name}" is not directly bookable.` };
    }

    return { allowed: true };
  },

  /**
   * Get the service duration from catalog (falls back to bookingRules default).
   */
  getServiceDuration(identity: BusinessIdentity, serviceNameOrId: string): number {
    const item = identity.servicesCatalog.find(
      s => s.id === serviceNameOrId ||
           s.name.toLowerCase() === serviceNameOrId.toLowerCase()
    );
    return item?.estimatedDuration ?? identity.bookingRules.defaultDurationMins;
  },

  /**
   * Is an emergency booking path available?
   */
  supportsEmergency(identity: BusinessIdentity): boolean {
    return identity.emergencyPolicy.enabled && identity.businessHours.emergencyAfterHours;
  },

  /**
   * Get the slot interval in minutes from booking rules.
   */
  slotIntervalMinutes(identity: BusinessIdentity): number {
    return identity.bookingRules.slotIntervalMins;
  },
};
