import { BusinessModel } from '../models/Business.model';
import { BusinessSettings } from '../types';

export const BusinessService = {
  async get(): Promise<BusinessSettings | null> {
    const doc = await BusinessModel.findOne();
    if (!doc) return null;
    const obj = doc.toJSON() as any;
    delete obj.id;
    delete obj.createdAt;
    delete obj.updatedAt;
    return obj as BusinessSettings;
  },

  async upsert(settings: Partial<BusinessSettings>): Promise<BusinessSettings> {
    const doc = await BusinessModel.findOneAndUpdate(
      {},
      { $set: settings },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );
    const obj = doc!.toJSON() as any;
    delete obj.id;
    delete obj.createdAt;
    delete obj.updatedAt;
    return obj as BusinessSettings;
  },
};
