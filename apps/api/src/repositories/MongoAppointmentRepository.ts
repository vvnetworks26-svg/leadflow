import { Appointment } from '../types';
import { IAppointmentRepository } from './IAppointmentRepository';
import { AppointmentModel } from '../models/Appointment.model';

function toPlain(doc: any): Appointment {
  const obj = doc.toJSON();
  return {
    ...obj,
    createdAt: obj.createdAt instanceof Date ? obj.createdAt.toISOString() : obj.createdAt,
    updatedAt: obj.updatedAt instanceof Date ? obj.updatedAt.toISOString() : obj.updatedAt,
  } as Appointment;
}

export class MongoAppointmentRepository implements IAppointmentRepository {
  async findAll(): Promise<Appointment[]> {
    const docs = await AppointmentModel.find().sort({ createdAt: -1 });
    return docs.map(toPlain);
  }

  async findById(id: string): Promise<Appointment | null> {
    const doc = await AppointmentModel.findById(id);
    return doc ? toPlain(doc) : null;
  }

  async create(data: Omit<Appointment, 'id'>): Promise<Appointment> {
    const doc = await AppointmentModel.create(data);
    return toPlain(doc);
  }

  async update(id: string, patch: Partial<Appointment>): Promise<Appointment | null> {
    const doc = await AppointmentModel.findByIdAndUpdate(id, patch, { new: true });
    return doc ? toPlain(doc) : null;
  }
}
