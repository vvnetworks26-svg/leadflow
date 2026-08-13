import { Request, Response, NextFunction } from 'express';
import { BusinessService } from '../services/BusinessService';
import { ApiError } from '../middleware/errorHandler';
import { UpsertBusinessSchema } from '../dto/business.dto';

export async function get(req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await BusinessService.get(req.organizationId!);
    if (!settings) throw new ApiError(404, 'Business settings not configured', 'BUSINESS_NOT_FOUND');
    res.json({ status: 'ok', data: settings });
  } catch (e) { next(e); }
}

export async function upsert(req: Request, res: Response, next: NextFunction) {
  try {
    const result = UpsertBusinessSchema.safeParse(req.body);
    if (!result.success) {
      const msg = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new ApiError(422, msg, 'VALIDATION_ERROR');
    }

    const settings = await BusinessService.upsert(req.organizationId!, result.data);
    res.json({ status: 'ok', data: settings });
  } catch (e) { next(e); }
}
