import { useState, useCallback } from 'react';
import { TimeSlot } from '../types';
import { calendarService } from '../services/calendar/calendarService';

/**
 * useCalendar — fetches available time slots from the calendar service.
 */
export function useCalendar() {
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSlots = useCallback(async (preferredDay?: string, duration = 60) => {
    setLoading(true);
    setError(null);
    try {
      const available = await calendarService.getAvailableSlots(preferredDay, duration);
      setSlots(available);
      return available;
    } catch (e) {
      setError('Could not load available slots');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  return { slots, loading, error, fetchSlots };
}
