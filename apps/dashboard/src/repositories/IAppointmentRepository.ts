import { Appointment } from '../types';

/**
 * IAppointmentRepository — contract for Appointment persistence.
 */
export interface IAppointmentRepository {
  findAll(): Appointment[];
  findById(id: string): Appointment | undefined;
  save(appointment: Appointment): void;
  saveAll(appointments: Appointment[]): void;
}
