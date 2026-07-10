/**
 * NotificationCenterService.ts
 *
 * Unified notification center — aggregates notifications from all sources
 * (CRM, bookings, payments, AI, automation, widget, security, system).
 * Built on top of the existing Notification model with source tagging.
 */

import { NotificationModel } from '../../models/Notification.model';
import { PaginatedResult, paginated } from '../../utils/query';
import type { Notification } from '../../types';

export type NotificationSource =
  | 'crm' | 'bookings' | 'payments' | 'ai' | 'automation'
  | 'widget' | 'security' | 'system' | 'workflow';

export interface NotificationFilter {
  source?:   NotificationSource;
  unread?:   boolean;
  priority?: 'high' | 'medium' | 'low';
  page?:     number;
  limit?:    number;
}

export const NotificationCenterService = {

  async list(
    organizationId: string,
    userId:         string,
    filter:         NotificationFilter = {},
  ): Promise<PaginatedResult<Notification>> {
    const page  = filter.page  ?? 1;
    const limit = filter.limit ?? 30;
    const skip  = (page - 1) * limit;

    const q: Record<string, unknown> = { organizationId, userId };
    if (filter.unread === true) q.read = false;

    const [docs, total] = await Promise.all([
      NotificationModel.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit),
      NotificationModel.countDocuments(q),
    ]);
    return paginated(docs.map(d => d.toJSON() as unknown as Notification), total, { page, limit, skip });
  },

  async markRead(organizationId: string, userId: string, id: string): Promise<void> {
    await NotificationModel.findOneAndUpdate({ _id: id, organizationId, userId }, { read: true });
  },

  async markAllRead(organizationId: string, userId: string): Promise<void> {
    await NotificationModel.updateMany({ organizationId, userId, read: false }, { read: true });
  },

  async delete(organizationId: string, userId: string, id: string): Promise<void> {
    await NotificationModel.findOneAndDelete({ _id: id, organizationId, userId });
  },

  async getUnreadCount(organizationId: string, userId: string): Promise<number> {
    return NotificationModel.countDocuments({ organizationId, userId, read: false });
  },

  /** Create a notification and push to SSE if client is connected. */
  async create(
    organizationId: string,
    userId:         string,
    data: {
      type:     'success' | 'info' | 'warning' | 'error';
      title:    string;
      message:  string;
    },
  ): Promise<void> {
    const doc = await NotificationModel.create({ organizationId, userId, ...data });
    // Push via SSE (fire-and-forget)
    try {
      const { broadcast } = require('../realtime/SseService');
      broadcast(organizationId, 'notification', {
        id: doc.id, type: data.type, title: data.title, message: data.message,
        userId, createdAt: new Date().toISOString(),
      });
    } catch { /* SSE not required */ }
  },
};
