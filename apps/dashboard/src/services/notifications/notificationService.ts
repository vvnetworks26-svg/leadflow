/**
 * notificationService.ts
 *
 * Mock notification service. All notification history is delegated to
 * notificationRepository. No direct localStorage access in this file.
 */

import { ToastNotification, BookingConfirmation, NotificationType } from '../../types';
import { notificationRepository } from '../../repositories/LocalNotificationRepository';

type NotificationListener = (notification: ToastNotification) => void;

const listeners: Set<NotificationListener> = new Set();

function makeId(): string {
  return `notif_${Math.random().toString(36).substr(2, 9)}`;
}

function emit(type: NotificationType, title: string, message: string): ToastNotification {
  const notification: ToastNotification = {
    id: makeId(),
    type,
    title,
    message,
    timestamp: new Date()
  };
  notificationRepository.append(notification);
  listeners.forEach(fn => fn(notification));
  return notification;
}

export const notificationService = {
  subscribe(fn: NotificationListener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  getHistory(): ToastNotification[] {
    return notificationRepository.getAll();
  },

  notifyOwner(confirmation: BookingConfirmation): void {
    emit(
      'success',
      'New Appointment Booked',
      `${confirmation.customerName} booked ${confirmation.service} on ${confirmation.displayDate} at ${confirmation.displayTime}. Confirmation: ${confirmation.confirmationNumber}`
    );
  },

  notifyCustomer(confirmation: BookingConfirmation): void {
    emit(
      'info',
      'Customer Notified',
      `Confirmation sent to ${confirmation.customerName} for ${confirmation.displayDate} at ${confirmation.displayTime}.`
    );
  },

  sendConfirmation(confirmation: BookingConfirmation): void {
    notificationService.notifyOwner(confirmation);
    notificationService.notifyCustomer(confirmation);
  },

  info(title: string, message: string): void {
    emit('info', title, message);
  },

  success(title: string, message: string): void {
    emit('success', title, message);
  },

  warning(title: string, message: string): void {
    emit('warning', title, message);
  },

  error(title: string, message: string): void {
    emit('error', title, message);
  }
};
