import { Request, Response, NextFunction } from 'express';
import { LeadService } from '../services/LeadService';
import { LeadQuerySchema } from '../dto/lead.dto';
import { param } from '../utils/params';
import { parseQuery } from '../utils/validate';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const q = parseQuery(LeadQuerySchema, req.query);
    const result = await LeadService.list(q);
    res.json({ status: 'ok', ...result });
  } catch (e) { next(e); }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const lead = await LeadService.getById(param(req.params.id));
    res.json({ status: 'ok', data: lead });
  } catch (e) { next(e); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const lead = await LeadService.create(req.body);
    res.status(201).json({ status: 'ok', data: lead });
  } catch (e) { next(e); }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const lead = await LeadService.update(param(req.params.id), req.body);
    res.json({ status: 'ok', data: lead });
  } catch (e) { next(e); }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await LeadService.delete(param(req.params.id));
    res.status(204).send();
  } catch (e) { next(e); }
}
