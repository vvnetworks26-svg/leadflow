import { ToastNotification } from '../types';
import { INotificationRepository } from './INotificationRepository';

const MAX_HISTORY = 50;

/**
 * LocalNotificationRepository
 *
 * In-memory implementation — notifications are session-scoped and do not
 * need to survive page reloads. Implements INotificationRepository so a
 * persistent adapter (IndexedDB, REST) can be swapped in without changing
 * notificationService.
 */
export class LocalNotificationRepository implements INotificationRepository {
  private history: ToastNotification[] = [];

  getAll(): ToastNotification[] {
    return [...this.history];
  }

  append(notification: ToastNotification): void {
    this.history.unshift(notification);
    if (this.history.length > MAX_HISTORY) {
      this.history.pop();
    }
  }

  clear(): void {
    this.history = [];
  }
}

/** Singleton instance used by notificationService. */
export const notificationRepository: INotificationRepository =
  new LocalNotificationRepository();
