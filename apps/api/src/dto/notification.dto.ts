import { z } from 'zod';

export const CreateNotificationSchema = z.object({
  type:    z.enum(['success','info','warning','error']),
  title:   z.string().min(1).trim(),
  message: z.string().min(1).trim(),
  read:    z.boolean().optional().default(false),
});
export type CreateNotificationDto = z.infer<typeof CreateNotificationSchema>;

export const NotificationQuerySchema = z.object({
  unread: z.coerce.boolean().optional(),
  page:   z.coerce.number().int().min(1).optional(),
  limit:  z.coerce.number().int().min(1).max(100).optional(),
});
export type NotificationQueryDto = z.infer<typeof NotificationQuerySchema>;
