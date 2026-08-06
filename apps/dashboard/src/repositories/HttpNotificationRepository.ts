import { ToastNotification } from '../types';
import { INotificationRepository } from './INotificationRepository';
import { apiClient } from '../lib/apiClient';

export class HttpNotificationRepository implements INotificationRepository {
  private history: ToastNotification[] = [];

  getAll(): ToastNotification[] { return [...this.history]; }

  append(notification: ToastNotification): void {
    this.history.unshift(notification);
    if (this.history.length > 50) this.history.pop();
    // Persist to backend
    apiClient.post('/notifications', {
      type:    notification.type,
      title:   notification.title,
      message: notification.message,
    }).catch(console.error);
  }

  clear(): void { this.history = []; }
}

export const httpNotificationRepository = new HttpNotificationRepository();
