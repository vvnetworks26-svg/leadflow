import { BusinessSettings } from '../types';

export interface IBusinessRepository {
  load(): Promise<BusinessSettings | null>;
  save(settings: BusinessSettings): Promise<BusinessSettings>;
}
