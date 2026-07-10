import { Schema, model, Document } from 'mongoose';
import { Notification } from '../types';

export interface NotificationDocument extends Omit<Notification, 'id'>, Document {
  organizationId: string;
  userId:         string;
}

const NotificationSchema = new Schema<NotificationDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    userId:         { type: String, required: true, index: true },
    type:           { type: String, enum: ['success','info','warning','error'], required: true },
    title:          { type: String, required: true },
    message:        { type: String, required: true },
    read:           { type: Boolean, default: false },
    createdAt:      { type: Date,    default: Date.now },
  },
  {
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        delete (ret as any)._id;
        return ret;
      },
    },
  }
);

// ─── Multi-tenant indexes ─────────────────────────────────────────────────────
NotificationSchema.index({ organizationId: 1, createdAt: -1 });
NotificationSchema.index({ organizationId: 1, userId: 1 });

export const NotificationModel = model<NotificationDocument>('Notification', NotificationSchema);
