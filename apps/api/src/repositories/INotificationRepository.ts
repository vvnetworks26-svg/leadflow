import { Notification } from '../types';

export interface INotificationRepository {
  findAll(): Promise<Notification[]>;
  findUnread(): Promise<Notification[]>;
  create(data: Omit<Notification, 'id'>): Promise<Notification>;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;
}
