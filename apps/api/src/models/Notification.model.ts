import { Schema, model, Document } from 'mongoose';
import { Notification } from '../types';

export interface NotificationDocument extends Omit<Notification, 'id'>, Document {}

const NotificationSchema = new Schema<NotificationDocument>(
  {
    type:      { type: String, enum: ['success','info','warning','error'], required: true },
    title:     { type: String, required: true },
    message:   { type: String, required: true },
    read:      { type: Boolean, default: false },
    createdAt: { type: Date,   default: Date.now },
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

export const NotificationModel = model<NotificationDocument>('Notification', NotificationSchema);
