import { Request, Response, NextFunction } from 'express';
import { NotificationService } from '../services/NotificationService';
import { NotificationQuerySchema } from '../dto/notification.dto';
import { param } from '../utils/params';
import { parseQuery } from '../utils/validate';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const q = parseQuery(NotificationQuerySchema, req.query);
    const result = await NotificationService.list(q);
    res.json({ status: 'ok', ...result });
  } catch (e) { next(e); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const notif = await NotificationService.create(req.body);
    res.status(201).json({ status: 'ok', data: notif });
  } catch (e) { next(e); }
}

export async function markRead(req: Request, res: Response, next: NextFunction) {
  try {
    await NotificationService.markRead(param(req.params.id));
    res.json({ status: 'ok', message: 'Marked as read' });
  } catch (e) { next(e); }
}

export async function markAllRead(req: Request, res: Response, next: NextFunction) {
  try {
    await NotificationService.markAllRead();
    res.json({ status: 'ok', message: 'All notifications marked as read' });
  } catch (e) { next(e); }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await NotificationService.delete(param(req.params.id));
    res.status(204).send();
  } catch (e) { next(e); }
}
