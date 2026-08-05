import { Appointment } from '../types';
import { IAppointmentRepository } from './IAppointmentRepository';

const STORAGE_KEY = 'leadflow_appointments';

const DEFAULT_APPOINTMENTS: Appointment[] = [
  {
    id: 'apt_1',
    leadId: 'lead_2',
    leadName: 'Sarah Jenkins',
    leadPhone: '(555) 876-5432',
    date: new Date().toISOString().split('T')[0],
    time: '14:30',
    duration: 90,
    type: 'Emergency Service',
    status: 'Scheduled',
    notes: 'Emergency AC leak. Assigned to Tech: Mike Reynolds.',
    assignedTechnician: 'Mike Reynolds',
    value: 450,
    source: 'AI Chatbot',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'apt_2',
    leadId: 'lead_1',
    leadName: 'Robert Henderson',
    leadPhone: '(555) 234-5678',
    date: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    time: '10:00',
    duration: 120,
    type: 'System Replacement Quote',
    status: 'Confirmed',
    notes: 'Detailed sizing measurement and final quote presentation.',
    assignedTechnician: 'Dave Carter (Project Manager)',
    value: 8500,
    source: 'AI Chatbot',
    confirmationNumber: 'LF-R3NDER9',
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'apt_3',
    leadId: 'lead_3',
    leadName: 'Thomas Sterling',
    leadPhone: '(555) 345-6789',
    date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    time: '09:00',
    duration: 60,
    type: 'Maintenance',
    status: 'Scheduled',
    notes: 'Standard 16-point HVAC tune up.',
    assignedTechnician: 'Chris Miller',
    value: 180,
    source: 'Google Search',
    createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'apt_4',
    leadId: 'lead_5',
    leadName: 'Marcus Brody',
    leadPhone: '(555) 567-8901',
    date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    time: '08:30',
    duration: 480,
    type: 'System Replacement Quote',
    status: 'Completed',
    notes: 'Full installation and county inspection sign-off completed.',
    assignedTechnician: 'Mike Reynolds & Chris Miller',
    value: 12400,
    source: 'Referral',
    createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString()
  }
];

/**
 * LocalAppointmentRepository
 *
 * Persists Appointment records to localStorage under 'leadflow_appointments'.
 */
export class LocalAppointmentRepository implements IAppointmentRepository {
  private read(): Appointment[] {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      this.write(DEFAULT_APPOINTMENTS);
      return DEFAULT_APPOINTMENTS;
    }
    return JSON.parse(raw) as Appointment[];
  }

  private write(appointments: Appointment[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appointments));
  }

  findAll(): Appointment[] {
    return this.read();
  }

  findById(id: string): Appointment | undefined {
    return this.read().find(a => a.id === id);
  }

  save(appointment: Appointment): void {
    const appointments = this.read();
    const idx = appointments.findIndex(a => a.id === appointment.id);
    if (idx !== -1) {
      appointments[idx] = appointment;
    } else {
      appointments.unshift(appointment);
    }
    this.write(appointments);
  }

  saveAll(appointments: Appointment[]): void {
    this.write(appointments);
  }
}

/** Singleton instance used by appointmentsApi. */
export const appointmentRepository: IAppointmentRepository = new LocalAppointmentRepository();
