import { Lead } from '../types';

/**
 * ILeadRepository — contract for Lead persistence.
 * Swap the LocalStorage implementation for a REST/MongoDB adapter
 * by implementing this interface and injecting it into leadsApi.
 */
export interface ILeadRepository {
  findAll(): Lead[];
  findById(id: string): Lead | undefined;
  save(lead: Lead): void;
  saveAll(leads: Lead[]): void;
  delete(id: string): void;
}
