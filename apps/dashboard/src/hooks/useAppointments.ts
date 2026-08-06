import { useState, useEffect, useCallback } from 'react';
import { Appointment, AppointmentStatus } from '../types';
import { appointmentsApi } from '../services/api/appointments';

/**
 * useAppointments — fetches and manages the appointments list.
 */
export function useAppointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await appointmentsApi.getAll();
      setAppointments(data);
    } catch (e) {
      setError('Failed to load appointments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateStatus = useCallback(async (id: string, status: AppointmentStatus) => {
    await appointmentsApi.update(id, { status });
    await load();
  }, [load]);

  return { appointments, loading, error, refresh: load, updateStatus };
}
