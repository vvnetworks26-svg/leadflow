import { Request, Response, NextFunction } from 'express';
import { AppointmentService } from '../services/AppointmentService';
import { AppointmentQuerySchema } from '../dto/appointment.dto';
import { param } from '../utils/params';
import { parseQuery } from '../utils/validate';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const q      = parseQuery(AppointmentQuerySchema, req.query);
    const result = await AppointmentService.list(req.organizationId!, q);
    res.json({ status: 'ok', ...result });
  } catch (e) { next(e); }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const apt = await AppointmentService.getById(req.organizationId!, param(req.params.id));
    res.json({ status: 'ok', data: apt });
  } catch (e) { next(e); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const apt = await AppointmentService.create(req.organizationId!, req.body);
    res.status(201).json({ status: 'ok', data: apt });
  } catch (e) { next(e); }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const apt = await AppointmentService.update(req.organizationId!, param(req.params.id), req.body);
    res.json({ status: 'ok', data: apt });
  } catch (e) { next(e); }
}

export async function cancel(req: Request, res: Response, next: NextFunction) {
  try {
    const apt = await AppointmentService.cancel(req.organizationId!, param(req.params.id));
    res.json({ status: 'ok', data: apt });
  } catch (e) { next(e); }
}
