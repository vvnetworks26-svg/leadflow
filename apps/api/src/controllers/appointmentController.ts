import { Request, Response, NextFunction } from 'express';
import { AppointmentService } from '../services/AppointmentService';
import { AppointmentQuerySchema } from '../dto/appointment.dto';
import { param } from '../utils/params';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const q = AppointmentQuerySchema.parse(req.query);
    const result = await AppointmentService.list(q);
    res.json({ status: 'ok', ...result });
  } catch (e) { next(e); }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const apt = await AppointmentService.getById(param(req.params.id));
    res.json({ status: 'ok', data: apt });
  } catch (e) { next(e); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const apt = await AppointmentService.create(req.body);
    res.status(201).json({ status: 'ok', data: apt });
  } catch (e) { next(e); }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const apt = await AppointmentService.update(param(req.params.id), req.body);
    res.json({ status: 'ok', data: apt });
  } catch (e) { next(e); }
}

export async function cancel(req: Request, res: Response, next: NextFunction) {
  try {
    const apt = await AppointmentService.cancel(param(req.params.id));
    res.json({ status: 'ok', data: apt });
  } catch (e) { next(e); }
}
