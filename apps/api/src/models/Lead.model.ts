import { Schema, model, Document } from 'mongoose';
import { Lead } from '../types';

export interface LeadDocument extends Omit<Lead, 'id'>, Document {}

const LeadSchema = new Schema<LeadDocument>(
  {
    name:                 { type: String, required: true, trim: true },
    email:                { type: String, trim: true, lowercase: true, default: '' },
    phone:                { type: String, required: true, trim: true },
    address:              { type: String, default: '' },
    zipCode:              { type: String, trim: true },
    status:               { type: String, enum: ['New','Contacted','Qualified','Unqualified','Proposal','Closed Won','Closed Lost'], default: 'New' },
    priority:             { type: String, enum: ['Low','Medium','High'], default: 'Medium' },
    value:                { type: Number, default: 0 },
    source:               { type: String, default: '' },
    hvacNeed:             { type: String, required: true },
    emergency:            { type: Boolean, default: false },
    conversationId:       { type: String },
    qualificationReason:  { type: String },
    preferredDay:         { type: String },
    appointmentId:        { type: String },
    notes:                { type: String, default: '' },
  },
  {
    timestamps: true,           // createdAt + updatedAt managed by Mongoose
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

export const LeadModel = model<LeadDocument>('Lead', LeadSchema);
