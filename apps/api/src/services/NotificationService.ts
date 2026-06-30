import { NotificationModel } from '../models/Notification.model';
import { ApiError } from '../middleware/errorHandler';
import { CreateNotificationDto, NotificationQueryDto } from '../dto/notification.dto';
import { Notification } from '../types';
import { PaginatedResult, paginated } from '../utils/query';

export const NotificationService = {
  async list(q: NotificationQueryDto): Promise<PaginatedResult<Notification>> {
    const page  = q.page  ?? 1;
    const limit = q.limit ?? 20;
    const skip  = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (q.unread === true) filter.read = false;

    const [docs, total] = await Promise.all([
      NotificationModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      NotificationModel.countDocuments(filter),
    ]);

    return paginated(docs.map(d => d.toJSON() as unknown as Notification), total, { page, limit, skip });
  },

  async create(dto: CreateNotificationDto): Promise<Notification> {
    const doc = await NotificationModel.create(dto);
    return doc.toJSON() as unknown as Notification;
  },

  async markRead(id: string): Promise<void> {
    const doc = await NotificationModel.findByIdAndUpdate(id, { read: true });
    if (!doc) throw new ApiError(404, 'Notification not found', 'NOTIFICATION_NOT_FOUND');
  },

  async markAllRead(): Promise<void> {
    await NotificationModel.updateMany({ read: false }, { read: true });
  },

  async delete(id: string): Promise<void> {
    const doc = await NotificationModel.findByIdAndDelete(id);
    if (!doc) throw new ApiError(404, 'Notification not found', 'NOTIFICATION_NOT_FOUND');
  },
};
