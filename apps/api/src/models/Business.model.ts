/**
 * Business.model.ts
 *
 * Organization-level business configuration (hours, services, AI, team, etc.)
 * Each organization has exactly one Business settings document.
 * All queries MUST filter by organizationId.
 */

import { Schema, model, Document } from 'mongoose';
import { BusinessSettings } from '../types';

export interface BusinessDocument extends Omit<BusinessSettings, 'id'>, Document {
  organizationId: string;
}

const DayScheduleSchema = new Schema(
  { isOpen: Boolean, openTime: String, closeTime: String },
  { _id: false }
);

const ServiceItemSchema = new Schema(
  { id: String, name: String, description: String, estimatedDuration: Number, emergencyAvailable: Boolean, active: Boolean },
  { _id: false }
);

const TeamMemberSchema = new Schema(
  { id: String, name: String, role: String, phone: String, email: String, status: { type: String, enum: ['Active','Inactive'] } },
  { _id: false }
);

const FaqItemSchema = new Schema(
  { id: String, question: String, answer: String },
  { _id: false }
);

const BusinessSchema = new Schema<BusinessDocument>(
  {
    organizationId: { type: String, required: true, unique: true, index: true },

    // Profile
    companyName:  { type: String, required: true },
    logoUrl:      { type: String, default: '' },
    ownerName:    { type: String, default: '' },
    email:        { type: String, default: '', lowercase: true },
    phone:        { type: String, default: '' },
    website:      { type: String, default: '' },
    address:      { type: String, default: '' },
    city:         { type: String, default: '' },
    state:        { type: String, default: '' },
    zipCode:      { type: String, default: '' },
    timezone:     { type: String, default: 'EST' },
    description:  { type: String, default: '' },
    industry:     { type: String, default: 'HVAC' },

    // Hours
    businessHours: {
      monday:    { type: DayScheduleSchema },
      tuesday:   { type: DayScheduleSchema },
      wednesday: { type: DayScheduleSchema },
      thursday:  { type: DayScheduleSchema },
      friday:    { type: DayScheduleSchema },
      saturday:  { type: DayScheduleSchema },
      sunday:    { type: DayScheduleSchema },
      emergencyAfterHours: { type: Boolean, default: true },
      vacationMode:        { type: Boolean, default: false },
    },

    // Service area
    serviceAreaZips:    { type: [String], default: [] },
    serviceAreaEnabled: { type: Boolean, default: true },

    // Services
    services: { type: [ServiceItemSchema], default: [] },

    // AI config
    aiConfig: {
      welcomeMessage:           { type: String, default: '' },
      tone:                     { type: String, enum: ['Friendly','Professional','Casual'], default: 'Friendly' },
      collectEmail:             { type: Boolean, default: true },
      collectAddress:           { type: Boolean, default: false },
      askPreferredTechnician:   { type: Boolean, default: false },
      enableEmergencyWorkflow:  { type: Boolean, default: true },
      faq:                      { type: [FaqItemSchema], default: [] },
    },

    // Team
    team: { type: [TeamMemberSchema], default: [] },

    // Notifications
    notifications: {
      smsAlerts:          { type: Boolean, default: true },
      emailDigest:        { type: Boolean, default: true },
      replacementAlerts:  { type: Boolean, default: true },
      webhookUrl:         { type: String, default: '' },
      webhookToken:       { type: String, default: '' },
    },
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

export const BusinessModel = model<BusinessDocument>('Business', BusinessSchema);
