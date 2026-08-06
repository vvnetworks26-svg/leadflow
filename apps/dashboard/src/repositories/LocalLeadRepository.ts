import { Lead } from '../types';
import { ILeadRepository } from './ILeadRepository';

const STORAGE_KEY = 'leadflow_leads';

const DEFAULT_LEADS: Lead[] = [
  {
    id: 'lead_1',
    name: 'Robert Henderson',
    email: 'r.henderson@gmail.com',
    phone: '(555) 234-5678',
    address: '1428 Maple Drive, Atlanta, GA 30308',
    zipCode: '30308',
    status: 'Proposal',
    priority: 'High',
    value: 8500,
    source: 'AI Chatbot',
    hvacNeed: 'System Replacement Quote',
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    notes: 'Homeowner wants to replace a 15-year-old Carrier furnace and AC unit. Looking for a high-efficiency 16 SEER system. Quote sent.'
  },
  {
    id: 'lead_2',
    name: 'Sarah Jenkins',
    email: 'sarahj@yahoo.com',
    phone: '(555) 876-5432',
    address: '894 Peachtree Street NE, Atlanta, GA 30309',
    zipCode: '30309',
    status: 'New',
    priority: 'High',
    value: 450,
    source: 'AI Chatbot',
    hvacNeed: 'AC Repair',
    emergency: true,
    createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    notes: 'AC unit in attic is leaking water and blowing warm air. Suspects clogged condensate line or refrigerant leak. Desperately needs technician today.'
  },
  {
    id: 'lead_3',
    name: 'Thomas Sterling',
    email: 'tsterling@outlook.com',
    phone: '(555) 345-6789',
    address: '412 Piedmont Ave NE, Atlanta, GA 30308',
    zipCode: '30308',
    status: 'Contacted',
    priority: 'Medium',
    value: 180,
    source: 'Google Search',
    hvacNeed: 'Maintenance',
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    notes: 'Annual seasonal tune-up. Customer requested scheduling maintenance on a weekend.'
  },
  {
    id: 'lead_4',
    name: 'Elena Rostova',
    email: 'elena.ros@gmail.com',
    phone: '(555) 456-7890',
    address: '228 Tenth St NE, Atlanta, GA 30309',
    zipCode: '30309',
    status: 'Qualified',
    priority: 'High',
    value: 5200,
    source: 'Facebook Ad',
    hvacNeed: 'Heat Pump Install',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    notes: 'Interested in switching from gas furnace to electric ducted heat pump. House is ~2,100 sq ft.'
  },
  {
    id: 'lead_5',
    name: 'Marcus Brody',
    email: 'marcus.brody@indiana.org',
    phone: '(555) 567-8901',
    address: '1050 Techwood Dr NW, Atlanta, GA 30318',
    zipCode: '30318',
    status: 'Closed Won',
    priority: 'Medium',
    value: 12400,
    source: 'Referral',
    hvacNeed: 'Full System Upgrade',
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    notes: 'Completed full installation of a new Lennox high-efficiency communicating heat pump and smart thermostat. Customer highly satisfied.'
  },
  {
    id: 'lead_6',
    name: 'Emily Watson',
    email: 'emilyw@gmail.com',
    phone: '(555) 678-9012',
    address: '55 26th St NW, Atlanta, GA 30309',
    zipCode: '30309',
    status: 'Closed Lost',
    priority: 'Low',
    value: 350,
    source: 'Yelp',
    hvacNeed: 'Duct Cleaning',
    createdAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
    notes: 'Canceled because competitor quoted $100 cheaper for full duct sanitization.'
  }
];

/**
 * LocalLeadRepository
 *
 * Persists Lead records to localStorage under 'leadflow_leads'.
 * Seeds default data on first access if the key is absent.
 * Implements ILeadRepository — swap for a REST implementation without
 * touching any service that depends on this interface.
 */
export class LocalLeadRepository implements ILeadRepository {
  private read(): Lead[] {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      this.write(DEFAULT_LEADS);
      return DEFAULT_LEADS;
    }
    return JSON.parse(raw) as Lead[];
  }

  private write(leads: Lead[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
  }

  findAll(): Lead[] {
    return this.read();
  }

  findById(id: string): Lead | undefined {
    return this.read().find(l => l.id === id);
  }

  save(lead: Lead): void {
    const leads = this.read();
    const idx = leads.findIndex(l => l.id === lead.id);
    if (idx !== -1) {
      leads[idx] = lead;
    } else {
      leads.unshift(lead);
    }
    this.write(leads);
  }

  saveAll(leads: Lead[]): void {
    this.write(leads);
  }

  delete(id: string): void {
    this.write(this.read().filter(l => l.id !== id));
  }
}

/** Singleton instance used by leadsApi. */
export const leadRepository: ILeadRepository = new LocalLeadRepository();
