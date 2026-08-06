/**
 * calendarService.ts (widget)
 *
 * Widget-scoped calendar service.
 * getAvailableSlots delegates to the widget API endpoint — no access to
 * dashboard localStorage or businessSettings required.
 *
 * bookAppointment is intentionally not implemented here; the widget drives
 * booking through widgetApiClient.book() directly (see useConversation.ts).
 */

import { widgetApiClient } from '../api/widgetApiClient';
import type { TimeSlot, BookingConfirmation } from '../../types';

export const calendarService = {
  /**
   * Fetch available slots via GET /api/v1/widget/:token/availability.
   * Falls back to a direct API call matching the dashboard calendarService
   * interface so useConversation.ts works without modification.
   */
  async getAvailableSlots(
    _preferredDay: string | undefined,
    _durationMinutes: number
  ): Promise<TimeSlot[]> {
    try {
      const config = await widgetApiClient.getConfig();
      // The API endpoint mirrors the dashboard's slot generation logic.
      // Token is resolved by widgetApiClient internally.
      const BASE_URL: string =
        ((typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) || 'http://localhost:4000') as string;
      const TOKEN: string =
        ((typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_WIDGET_TOKEN) || '') as string;

      const res = await fetch(
        `${BASE_URL}/api/v1/widget/${TOKEN}/availability` +
        `?duration=${_durationMinutes ?? 60}` +
        (_preferredDay ? `&preferredDay=${encodeURIComponent(_preferredDay)}` : ''),
        { method: 'GET', headers: { 'Content-Type': 'application/json' } }
      );

      if (!res.ok) throw new Error(`availability ${res.status}`);

      const json = await res.json();
      return (json.data ?? []) as TimeSlot[];
    } catch (err) {
      console.warn('[widget/calendarService] getAvailableSlots failed:', err);
      return [];
    }
  },
};
