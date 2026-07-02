import { Request, Response, NextFunction } from 'express';
import { ConversationService } from '../services/ConversationService';
import { ConversationQuerySchema } from '../dto/conversation.dto';
import { param } from '../utils/params';
import { parseQuery } from '../utils/validate';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const q = parseQuery(ConversationQuerySchema, req.query);
    const result = await ConversationService.list(q);
    res.json({ status: 'ok', ...result });
  } catch (e) { next(e); }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const conv = await ConversationService.getById(param(req.params.id));
    res.json({ status: 'ok', data: conv });
  } catch (e) { next(e); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const conv = await ConversationService.create(req.body);
    res.status(201).json({ status: 'ok', data: conv });
  } catch (e) { next(e); }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const conv = await ConversationService.update(param(req.params.id), req.body);
    res.json({ status: 'ok', data: conv });
  } catch (e) { next(e); }
}

export async function addMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const msg = await ConversationService.addMessage(param(req.params.id), req.body);
    res.status(201).json({ status: 'ok', data: msg });
  } catch (e) { next(e); }
}
