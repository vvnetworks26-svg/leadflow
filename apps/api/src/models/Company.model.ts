/**
 * Company.model.ts
 *
 * Company (account) record for B2B CRM use cases.
 * Contacts and leads are linked to companies.
 */

import { Schema, model, Document } from 'mongoose';

export interface ICompany {
  id:             string;
  organizationId: string;
  name:           string;
  domain:         string;
  website:        string;
  industry:       string;
  employeeCount:  number | null;
  annualRevenue:  number | null;
  phone:          string;
  email:          string;
  address:        string;
  city:           string;
  state:          string;
  country:        string;
  description:    string;
  tags:           string[];
  ownerId:        string | null;
  customFields:   Record<string, unknown>;
  createdAt:      Date;
  updatedAt:      Date;
}

export interface CompanyDocument extends Omit<ICompany, 'id'>, Document {}

const CompanySchema = new Schema<CompanyDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    name:           { type: String, required: true, trim: true },
    domain:         { type: String, default: '', lowercase: true, trim: true },
    website:        { type: String, default: '' },
    industry:       { type: String, default: '' },
    employeeCount:  { type: Number, default: null },
    annualRevenue:  { type: Number, default: null },
    phone:          { type: String, default: '' },
    email:          { type: String, default: '', lowercase: true },
    address:        { type: String, default: '' },
    city:           { type: String, default: '' },
    state:          { type: String, default: '' },
    country:        { type: String, default: '' },
    description:    { type: String, default: '' },
    tags:           { type: [String], default: [] },
    ownerId:        { type: String, default: null },
    customFields:   { type: Schema.Types.Mixed, default: {} },
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

CompanySchema.index({ organizationId: 1, createdAt: -1 });
CompanySchema.index({ organizationId: 1, domain: 1 });
CompanySchema.index(
  { name: 'text', domain: 'text', industry: 'text', description: 'text' },
  { name: 'company_text_search', weights: { name: 10, domain: 5 } }
);

export const CompanyModel = model<CompanyDocument>('Company', CompanySchema);
