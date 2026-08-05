/**
 * notificationService.ts (widget)
 *
 * Widget-scoped notification service.
 * Provides the same interface as the dashboard version so useConversation.ts
 * works without modification. No localStorage repository required.
 */

import type { BookingConfirmation, ToastNotification, NotificationType } from '../../types';

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
    timestamp: new Date(),
  };
  listeners.forEach(fn => fn(notification));
  return notification;
}

export const notificationService = {
  subscribe(fn: NotificationListener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  getHistory(): ToastNotification[] {
    return [];
  },

  notifyOwner(_confirmation: BookingConfirmation): void {
    // Widget has no owner notification UI — no-op
  },

  notifyCustomer(_confirmation: BookingConfirmation): void {
    // Widget has no customer notification UI — no-op
  },

  sendConfirmation(_confirmation: BookingConfirmation): void {
    // Booking confirmation is shown inline in the chat — no toast needed
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
  },
};
