import { Appointment } from '../types';
import { IAppointmentRepository } from './IAppointmentRepository';
import { apiClient } from '../lib/apiClient';

export class HttpAppointmentRepository implements IAppointmentRepository {
  private cache: Appointment[] = [];
  private loaded = false;

  private invalidate(): void { this.loaded = false; }

  findAll(): Appointment[] { return this.cache; }

  findById(id: string): Appointment | undefined {
    return this.cache.find(a => a.id === id);
  }

  save(appointment: Appointment): void {
    const idx = this.cache.findIndex(a => a.id === appointment.id);
    if (idx !== -1) this.cache[idx] = appointment;
    else this.cache.unshift(appointment);
    this.invalidate();
  }

  saveAll(appointments: Appointment[]): void {
    this.cache = appointments;
    this.invalidate();
  }

  async fetchAll(): Promise<Appointment[]> {
    const res = await apiClient.get<{ data: Appointment[] }>('/appointments?limit=200');
    this.cache = res.data.data;
    this.loaded = true;
    return this.cache;
  }

  async fetchById(id: string): Promise<Appointment | undefined> {
    const res = await apiClient.get<{ data: Appointment }>(`/appointments/${id}`);
    return res.data.data;
  }

  async createRemote(data: Omit<Appointment, 'id'>): Promise<Appointment> {
    const res = await apiClient.post<{ data: Appointment }>('/appointments', data);
    const apt = res.data.data;
    this.cache.unshift(apt);
    return apt;
  }

  async updateRemote(id: string, updates: Partial<Appointment>): Promise<Appointment> {
    const res = await apiClient.patch<{ data: Appointment }>(`/appointments/${id}`, updates);
    const apt = res.data.data;
    const idx = this.cache.findIndex(a => a.id === id);
    if (idx !== -1) this.cache[idx] = apt;
    return apt;
  }
}

export const httpAppointmentRepository = new HttpAppointmentRepository();
