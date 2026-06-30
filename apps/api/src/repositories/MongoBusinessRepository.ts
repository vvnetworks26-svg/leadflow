import { BusinessSettings } from '../types';
import { IBusinessRepository } from './IBusinessRepository';
import { BusinessModel } from '../models/Business.model';

function toPlain(doc: any): BusinessSettings {
  const obj = doc.toJSON();
  // Remove Mongoose-added fields that don't belong on the domain type
  delete obj.id;
  delete obj.createdAt;
  delete obj.updatedAt;
  return obj as BusinessSettings;
}

export class MongoBusinessRepository implements IBusinessRepository {
  /** Load the single business settings document (first record). */
  async load(): Promise<BusinessSettings | null> {
    const doc = await BusinessModel.findOne();
    return doc ? toPlain(doc) : null;
  }

  /**
   * Upsert the business settings document.
   * There is intentionally only one document per database.
   */
  async save(settings: BusinessSettings): Promise<BusinessSettings> {
    const doc = await BusinessModel.findOneAndUpdate(
      {},
      settings,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return toPlain(doc!);
  }
}
