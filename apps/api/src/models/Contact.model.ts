/**
 * Contact.model.ts
 *
 * A person contact record. Contacts can be linked to multiple leads
 * and multiple companies. Separate from Lead to model real-world CRM data.
 */

import { Schema, model, Document } from 'mongoose';

export interface IContact {
  id:             string;
  organizationId: string;
  firstName:      string;
  lastName:       string;
  emails:         string[];
  phones:         string[];
  jobTitle:       string;
  companyId:      string | null;
  leadIds:        string[];
  addresses:      Array<{ label: string; street: string; city: string; state: string; zip: string; country: string }>;
  socialLinks:    Record<string, string>;   // { linkedin, twitter, website, ... }
  timezone:       string;
  notes:          string;
  tags:           string[];
  ownerId:        string | null;
  createdAt:      Date;
  updatedAt:      Date;
}

export interface ContactDocument extends Omit<IContact, 'id'>, Document {}

const AddressSchema = new Schema(
  { label: String, street: String, city: String, state: String, zip: String, country: String },
  { _id: false }
);

const ContactSchema = new Schema<ContactDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    firstName:      { type: String, required: true, trim: true },
    lastName:       { type: String, default: '', trim: true },
    emails:         { type: [String], default: [] },
    phones:         { type: [String], default: [] },
    jobTitle:       { type: String, default: '' },
    companyId:      { type: String, default: null },
    leadIds:        { type: [String], default: [] },
    addresses:      { type: [AddressSchema], default: [] },
    socialLinks:    { type: Schema.Types.Mixed, default: {} },
    timezone:       { type: String, default: '' },
    notes:          { type: String, default: '' },
    tags:           { type: [String], default: [] },
    ownerId:        { type: String, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => { ret.id = ret._id.toString(); delete (ret as any)._id; return ret; },
    },
  }
);

ContactSchema.index({ organizationId: 1, createdAt: -1 });
ContactSchema.index({ organizationId: 1, emails: 1 });
ContactSchema.index({ organizationId: 1, phones: 1 });
ContactSchema.index({ organizationId: 1, companyId: 1 });
// Text search index
ContactSchema.index(
  { firstName: 'text', lastName: 'text', emails: 'text', phones: 'text', notes: 'text' },
  { name: 'contact_text_search', weights: { firstName: 10, lastName: 10, emails: 5, phones: 5 } }
);

export const ContactModel = model<ContactDocument>('Contact', ContactSchema);
