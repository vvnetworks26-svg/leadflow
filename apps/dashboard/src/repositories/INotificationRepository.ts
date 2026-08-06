import { ToastNotification } from '../types';

/**
 * INotificationRepository — contract for notification history persistence.
 * The current implementation is in-memory only; this interface makes
 * a future persistent implementation (IndexedDB, REST) a drop-in swap.
 */
export interface INotificationRepository {
  getAll(): ToastNotification[];
  append(notification: ToastNotification): void;
  clear(): void;
}
