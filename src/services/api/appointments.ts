import { Appointment } from '../../types';
import { httpAppointmentRepository } from '../../repositories/HttpAppointmentRepository';

/**
 * appointmentsApi — Appointment business logic.
 * Delegates persistence to httpAppointmentRepository (Express REST API).
 */
export const appointmentsApi = {
  getAll: async (): Promise<Appointment[]> => {
    try {
      return await httpAppointmentRepository.fetchAll();
    } catch {
      return httpAppointmentRepository.findAll();
    }
  },

  getById: async (id: string): Promise<Appointment | undefined> => {
    try {
      return await httpAppointmentRepository.fetchById(id);
    } catch {
      return httpAppointmentRepository.findById(id);
    }
  },

  create: async (data: Omit<Appointment, 'id'>): Promise<Appointment> => {
    await new Promise(r => setTimeout(r, 200));
    return httpAppointmentRepository.createRemote(data);
  },

  update: async (id: string, updates: Partial<Appointment>): Promise<Appointment> => {
    await new Promise(r => setTimeout(r, 200));
    return httpAppointmentRepository.updateRemote(id, updates);
  }
};
