import { Notification } from '../types';
import { INotificationRepository } from './INotificationRepository';
import { NotificationModel } from '../models/Notification.model';

function toPlain(doc: any): Notification {
  const obj = doc.toJSON();
  return {
    id:        obj.id,
    type:      obj.type,
    title:     obj.title,
    message:   obj.message,
    read:      obj.read,
    createdAt: obj.createdAt instanceof Date ? obj.createdAt : new Date(obj.createdAt),
  } as Notification;
}

export class MongoNotificationRepository implements INotificationRepository {
  async findAll(): Promise<Notification[]> {
    const docs = await NotificationModel.find().sort({ createdAt: -1 }).limit(100);
    return docs.map(toPlain);
  }

  async findUnread(): Promise<Notification[]> {
    const docs = await NotificationModel.find({ read: false }).sort({ createdAt: -1 });
    return docs.map(toPlain);
  }

  async create(data: Omit<Notification, 'id'>): Promise<Notification> {
    const doc = await NotificationModel.create(data);
    return toPlain(doc);
  }

  async markRead(id: string): Promise<void> {
    await NotificationModel.findByIdAndUpdate(id, { read: true });
  }

  async markAllRead(): Promise<void> {
    await NotificationModel.updateMany({ read: false }, { read: true });
  }
}
