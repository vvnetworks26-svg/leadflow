/**
 * Organization.model.ts
 *
 * Every business/tenant is an Organization.
 * All domain records reference organizationId.
 * OrganizationMember links users to organizations with a role.
 */

import { Schema, model, Document } from 'mongoose';

// ─── Plans & statuses ────────────────────────────────────────────────────────

export type OrgPlan   = 'free' | 'starter' | 'pro' | 'enterprise';
export type OrgStatus = 'active' | 'suspended' | 'cancelled';

// ─── Member roles (expanded from the old 3-role set) ─────────────────────────

export type MemberRole = 'owner' | 'admin' | 'manager' | 'agent' | 'viewer';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface IOrganization {
  id:         string;
  name:       string;
  slug:       string;          // lowercase, URL-safe
  logo:       string;
  website:    string;
  industry:   string;
  country:    string;
  timezone:   string;
  currency:   string;
  plan:       OrgPlan;
  status:     OrgStatus;
  createdAt:  Date;
  updatedAt:  Date;
}

export interface IOrganizationMember {
  id:             string;
  organizationId: string;
  userId:         string;
  role:           MemberRole;
  joinedAt:       Date;
  status:         'active' | 'inactive';
}

export interface OrganizationDocument extends Omit<IOrganization, 'id'>, Document {}
export interface OrganizationMemberDocument extends Omit<IOrganizationMember, 'id'>, Document {}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const OrganizationSchema = new Schema<OrganizationDocument>(
  {
    name:     { type: String, required: true, trim: true },
    slug:     { type: String, required: true, unique: true, lowercase: true, trim: true },
    logo:     { type: String, default: '' },
    website:  { type: String, default: '' },
    industry: { type: String, default: 'HVAC' },
    country:  { type: String, default: 'US' },
    timezone: { type: String, default: 'America/New_York' },
    currency: { type: String, default: 'USD' },
    plan:     { type: String, enum: ['free','starter','pro','enterprise'], default: 'free' },
    status:   { type: String, enum: ['active','suspended','cancelled'], default: 'active' },
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

// ─── Compound indexes ─────────────────────────────────────────────────────────
OrganizationSchema.index({ status: 1 });
OrganizationSchema.index({ createdAt: -1 });

const OrganizationMemberSchema = new Schema<OrganizationMemberDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    userId:         { type: String, required: true, index: true },
    role:           { type: String, enum: ['owner','admin','manager','agent','viewer'], default: 'agent' },
    joinedAt:       { type: Date, default: Date.now },
    status:         { type: String, enum: ['active','inactive'], default: 'active' },
  },
  {
    timestamps: false,
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

// Unique membership per org+user
OrganizationMemberSchema.index({ organizationId: 1, userId: 1 }, { unique: true });

export const OrganizationModel       = model<OrganizationDocument>('Organization', OrganizationSchema);
export const OrganizationMemberModel = model<OrganizationMemberDocument>('OrganizationMember', OrganizationMemberSchema);
