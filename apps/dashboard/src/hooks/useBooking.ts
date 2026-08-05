import { useState, useCallback } from 'react';
import { BookingConfirmation, TimeSlot, ConversationData } from '../types';
import { calendarService } from '../services/calendar/calendarService';
import { notificationService } from '../services/notifications/notificationService';

/**
 * useBooking — handles the booking transaction:
 * 1. Calls calendarService.bookAppointment
 * 2. Fires notifications
 * 3. Returns the BookingConfirmation
 */
export function useBooking() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);

  const book = useCallback(async (
    slot: TimeSlot,
    data: ConversationData,
    meta: { conversationId?: string; leadId?: string }
  ): Promise<BookingConfirmation | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await calendarService.bookAppointment({
        slot,
        customerName: data.name ?? 'Unknown',
        phone: data.phone ?? '',
        email: data.email,
        address: data.zipCode ? `ZIP: ${data.zipCode}` : 'Not provided',
        zipCode: data.zipCode,
        service: data.service ?? 'General HVAC Service',
        emergency: data.emergency ?? false,
        conversationId: meta.conversationId,
        leadId: meta.leadId,
        notes: `Customer preferred day: ${data.preferredDay ?? 'flexible'}.`
      });

      setConfirmation(result);
      notificationService.sendConfirmation(result);
      return result;
    } catch (e) {
      const msg = 'Failed to book appointment. Please try again.';
      setError(msg);
      notificationService.error('Booking Failed', msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { book, loading, error, confirmation };
}
