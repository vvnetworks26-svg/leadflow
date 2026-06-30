import { useState, useEffect, useCallback } from 'react';
import { Lead } from '../types';
import { leadsApi } from '../services/api/leads';

/**
 * useLead — fetches and manages the leads list.
 * Exposes a `refresh` function so any component can trigger a re-fetch
 * (e.g., after the chat widget creates a new lead).
 */
export function useLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await leadsApi.getAll();
      setLeads(data);
    } catch (e) {
      setError('Failed to load leads');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { leads, loading, error, refresh: load };
}
