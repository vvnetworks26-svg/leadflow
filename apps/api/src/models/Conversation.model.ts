import { Schema, model, Document } from 'mongoose';
import { Conversation } from '../types';

export interface ConversationDocument extends Omit<Conversation, 'id'>, Document {}

const MessageSchema = new Schema(
  {
    id:        { type: String, required: true },
    sender:    { type: String, enum: ['ai','user','agent'], required: true },
    text:      { type: String, required: true },
    timestamp: { type: String, required: true },
  },
  { _id: false }
);

const ConversationSchema = new Schema<ConversationDocument>(
  {
    leadName:      { type: String, required: true },
    leadPhone:     { type: String, required: true },
    leadEmail:     { type: String, lowercase: true },
    messages:      { type: [MessageSchema], default: [] },
    status:        { type: String, enum: ['active','archived','snoozed','completed'], default: 'active' },
    lastMessageAt: { type: String, required: true },
    hvacNeed:      { type: String },
    leadId:        { type: String },
    appointmentId: { type: String },
  },
  {
    timestamps: true,
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

export const ConversationModel = model<ConversationDocument>('Conversation', ConversationSchema);
