import { Schema, model, Document } from 'mongoose';
import { Appointment } from '../types';

export interface AppointmentDocument extends Omit<Appointment, 'id'>, Document {}

const AppointmentSchema = new Schema<AppointmentDocument>(
  {
    leadId:               { type: String, required: true },
    leadName:             { type: String, required: true },
    leadPhone:            { type: String, required: true },
    conversationId:       { type: String },
    customerEmail:        { type: String, lowercase: true },
    address:              { type: String },
    zipCode:              { type: String },
    confirmationNumber:   { type: String },
    source:               { type: String },
    date:                 { type: String, required: true },   // YYYY-MM-DD
    time:                 { type: String, required: true },   // HH:MM
    duration:             { type: Number, required: true },   // minutes
    type:                 { type: String, enum: ['Maintenance','Repair Consultation','System Replacement Quote','Emergency Service'], required: true },
    status:               { type: String, enum: ['Scheduled','Completed','Canceled','No Show','Pending','Confirmed','Rescheduled'], default: 'Scheduled' },
    notes:                { type: String, default: '' },
    assignedTechnician:   { type: String },
    value:                { type: Number },
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

export const AppointmentModel = model<AppointmentDocument>('Appointment', AppointmentSchema);
