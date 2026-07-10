import { NotificationModel } from '../models/Notification.model';
import { ApiError } from '../middleware/errorHandler';
import { CreateNotificationDto, NotificationQueryDto } from '../dto/notification.dto';
import { Notification } from '../types';
import { PaginatedResult, paginated } from '../utils/query';

export const NotificationService = {
  async list(organizationId: string, userId: string, q: NotificationQueryDto): Promise<PaginatedResult<Notification>> {
    const page  = q.page  ?? 1;
    const limit = q.limit ?? 20;
    const skip  = (page - 1) * limit;

    const filter: Record<string, unknown> = { organizationId, userId };
    if (q.unread === true) filter.read = false;

    const [docs, total] = await Promise.all([
      NotificationModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      NotificationModel.countDocuments(filter),
    ]);

    return paginated(docs.map(d => d.toJSON() as unknown as Notification), total, { page, limit, skip });
  },

  async create(organizationId: string, userId: string, dto: CreateNotificationDto): Promise<Notification> {
    const doc = await NotificationModel.create({ ...dto, organizationId, userId });
    return doc.toJSON() as unknown as Notification;
  },

  async markRead(organizationId: string, userId: string, id: string): Promise<void> {
    const doc = await NotificationModel.findOneAndUpdate(
      { _id: id, organizationId, userId },
      { read: true }
    );
    if (!doc) throw new ApiError(404, 'Notification not found', 'NOTIFICATION_NOT_FOUND');
  },

  async markAllRead(organizationId: string, userId: string): Promise<void> {
    await NotificationModel.updateMany({ organizationId, userId, read: false }, { read: true });
  },

  async delete(organizationId: string, userId: string, id: string): Promise<void> {
    const doc = await NotificationModel.findOneAndDelete({ _id: id, organizationId, userId });
    if (!doc) throw new ApiError(404, 'Notification not found', 'NOTIFICATION_NOT_FOUND');
  },
};
