import { Appointment } from '../types';

export interface IAppointmentRepository {
  findAll(): Promise<Appointment[]>;
  findById(id: string): Promise<Appointment | null>;
  create(data: Omit<Appointment, 'id'>): Promise<Appointment>;
  update(id: string, patch: Partial<Appointment>): Promise<Appointment | null>;
}
