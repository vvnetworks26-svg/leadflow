import { Lead } from '../types';
import { ILeadRepository } from './ILeadRepository';
import { LeadModel } from '../models/Lead.model';

function toPlain(doc: any): Lead {
  const obj = doc.toJSON();
  return {
    ...obj,
    createdAt: obj.createdAt instanceof Date ? obj.createdAt.toISOString() : obj.createdAt,
    updatedAt: obj.updatedAt instanceof Date ? obj.updatedAt.toISOString() : obj.updatedAt,
  } as Lead;
}

export class MongoLeadRepository implements ILeadRepository {
  async findAll(): Promise<Lead[]> {
    const docs = await LeadModel.find().sort({ createdAt: -1 });
    return docs.map(toPlain);
  }

  async findById(id: string): Promise<Lead | null> {
    const doc = await LeadModel.findById(id);
    return doc ? toPlain(doc) : null;
  }

  async create(data: Omit<Lead, 'id' | 'createdAt'>): Promise<Lead> {
    const doc = await LeadModel.create(data);
    return toPlain(doc);
  }

  async update(id: string, patch: Partial<Lead>): Promise<Lead | null> {
    const doc = await LeadModel.findByIdAndUpdate(id, patch, { new: true });
    return doc ? toPlain(doc) : null;
  }

  async delete(id: string): Promise<void> {
    await LeadModel.findByIdAndDelete(id);
  }
}
