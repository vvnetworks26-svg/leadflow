/**
 * booking-engine/CalendarProvider.ts
 *
 * Calendar provider interface for Layer 8.
 * The Booking Engine never talks to Google/Outlook SDKs directly.
 * It only knows this interface.
 *
 * PURE interface — no implementation.
 */

import type { CalendarEvent, CalendarProviderName, IBookingCalendarProvider } from './types';

export type { IBookingCalendarProvider, CalendarEvent, CalendarProviderName };

/**
 * Registry of calendar providers, keyed by name.
 * Call registerProvider() to add a provider at startup.
 * Call getProvider() to retrieve one for use.
 */
const _registry = new Map<CalendarProviderName, IBookingCalendarProvider>();

export const CalendarProviderRegistry = {

  register(provider: IBookingCalendarProvider): void {
    _registry.set(provider.name, provider);
  },

  get(name: CalendarProviderName): IBookingCalendarProvider | null {
    return _registry.get(name) ?? null;
  },

  /** Returns the first registered provider, or null. */
  default(): IBookingCalendarProvider | null {
    const first = _registry.values().next();
    return first.done ? null : (first.value ?? null);
  },

  /** Returns true if any provider is registered. */
  hasProvider(): boolean {
    return _registry.size > 0;
  },

  /** List registered provider names. */
  list(): CalendarProviderName[] {
    return [..._registry.keys()];
  },

  /** Clear all providers (for test isolation). */
  reset(): void {
    _registry.clear();
  },
};
