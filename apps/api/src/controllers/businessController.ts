import { Request, Response, NextFunction } from 'express';
import { BusinessService } from '../services/BusinessService';
import { ApiError } from '../middleware/errorHandler';

export async function get(req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await BusinessService.get(req.organizationId!);
    if (!settings) throw new ApiError(404, 'Business settings not configured', 'BUSINESS_NOT_FOUND');
    res.json({ status: 'ok', data: settings });
  } catch (e) { next(e); }
}

export async function upsert(req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await BusinessService.upsert(req.organizationId!, req.body);
    res.json({ status: 'ok', data: settings });
  } catch (e) { next(e); }
}
