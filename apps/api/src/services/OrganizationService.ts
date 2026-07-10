/**
 * OrganizationService.ts
 *
 * Manages organization lifecycle: creation, updates, member management,
 * and onboarding seed data. Every method is organization-scoped.
 */

import { OrganizationModel, OrganizationMemberModel, IOrganizationMember, MemberRole } from '../models/Organization.model';
import { BusinessModel }    from '../models/Business.model';
import { PipelineService }  from '../crm/pipeline/PipelineService';
import { MeetingTypeService } from '../calendar/scheduling/MeetingTypeService';
import { HolidayService }     from '../calendar/scheduling/HolidayService';
import { AgentService }       from '../ai-agents/agents/AgentService';
import { ApiError }           from '../middleware/errorHandler';
import type { IOrganization } from '../models/Organization.model';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

async function uniqueSlug(base: string): Promise<string> {
  let slug  = base;
  let count = 0;
  while (await OrganizationModel.exists({ slug })) {
    count += 1;
    slug   = `${base}-${count}`;
  }
  return slug;
}

// ─── Default seed data ────────────────────────────────────────────────────────

async function seedDefaults(organizationId: string, companyName: string): Promise<void> {
  // Seed default Business/settings document
  await BusinessModel.create({
    organizationId,
    companyName,
    businessHours: {
      monday:    { isOpen: true,  openTime: '08:00', closeTime: '17:00' },
      tuesday:   { isOpen: true,  openTime: '08:00', closeTime: '17:00' },
      wednesday: { isOpen: true,  openTime: '08:00', closeTime: '17:00' },
      thursday:  { isOpen: true,  openTime: '08:00', closeTime: '17:00' },
      friday:    { isOpen: true,  openTime: '08:00', closeTime: '17:00' },
      saturday:  { isOpen: false, openTime: '09:00', closeTime: '14:00' },
      sunday:    { isOpen: false, openTime: '09:00', closeTime: '14:00' },
      emergencyAfterHours: true,
      vacationMode: false,
    },
    services: [
      { id: 'svc_001', name: 'AC Repair',          description: 'Air conditioning repair service',     estimatedDuration: 90,  emergencyAvailable: true,  active: true },
      { id: 'svc_002', name: 'Heating Repair',      description: 'Heating system repair service',       estimatedDuration: 90,  emergencyAvailable: true,  active: true },
      { id: 'svc_003', name: 'HVAC Maintenance',    description: 'Seasonal maintenance and inspection',  estimatedDuration: 60,  emergencyAvailable: false, active: true },
      { id: 'svc_004', name: 'System Replacement',  description: 'Full HVAC system replacement quote',  estimatedDuration: 120, emergencyAvailable: false, active: true },
    ],
    aiConfig: {
      welcomeMessage: `Hi! I'm the ${companyName} assistant. How can I help you today?`,
      tone: 'Friendly',
      collectEmail: true,
      collectAddress: false,
      askPreferredTechnician: false,
      enableEmergencyWorkflow: true,
      faq: [],
    },
    serviceAreaEnabled: true,
    serviceAreaZips: [],
    team: [],
    notifications: {
      smsAlerts: true,
      emailDigest: true,
      replacementAlerts: true,
      webhookUrl: '',
      webhookToken: '',
    },
  });
}

// ─── Public service ───────────────────────────────────────────────────────────

export const OrganizationService = {

  /**
   * Create a new organization and seed default configuration.
   * Called during user registration (onboarding flow).
   */
  async create(name: string): Promise<IOrganization> {
    const slug = await uniqueSlug(buildSlug(name));
    const org  = await OrganizationModel.create({ name, slug });

    // Fire-and-forget seed — don't fail org creation if seeding errors
    seedDefaults(org.id as string, name).catch(() => {/* non-blocking */});
    // Seed default pipeline
    PipelineService.seedDefault(org.id as string).catch(() => {});
    // Seed default meeting types
    MeetingTypeService.seedDefaults(org.id as string).catch(() => {});
    // Seed default holidays
    HolidayService.seedDefaults(org.id as string).catch(() => {});
    // Seed default AI agents (seeded with org owner userId — use system placeholder)
    AgentService.seedDefaults(org.id as string, 'system').catch(() => {});

    return org.toJSON() as unknown as IOrganization;
  },

  /** Get an organization by ID. Throws 404 if not found. */
  async getById(organizationId: string): Promise<IOrganization> {
    const org = await OrganizationModel.findById(organizationId);
    if (!org) throw new ApiError(404, 'Organization not found', 'ORG_NOT_FOUND');
    return org.toJSON() as unknown as IOrganization;
  },

  /** Get by slug (for public-facing widget resolution). */
  async getBySlug(slug: string): Promise<IOrganization> {
    const org = await OrganizationModel.findOne({ slug });
    if (!org) throw new ApiError(404, 'Organization not found', 'ORG_NOT_FOUND');
    return org.toJSON() as unknown as IOrganization;
  },

  /** Update organization metadata. Only org-scoped data is modified. */
  async update(organizationId: string, data: Partial<Omit<IOrganization, 'id' | 'slug' | 'createdAt' | 'updatedAt'>>): Promise<IOrganization> {
    const org = await OrganizationModel.findByIdAndUpdate(
      organizationId,
      { $set: data },
      { new: true, runValidators: true }
    );
    if (!org) throw new ApiError(404, 'Organization not found', 'ORG_NOT_FOUND');
    return org.toJSON() as unknown as IOrganization;
  },

  // ─── Member management ─────────────────────────────────────────────────────

  /** Add a user as a member of an organization. */
  async addMember(organizationId: string, userId: string, role: MemberRole): Promise<IOrganizationMember> {
    const member = await OrganizationMemberModel.findOneAndUpdate(
      { organizationId, userId },
      { $set: { role, status: 'active', joinedAt: new Date() } },
      { upsert: true, new: true }
    );
    return member.toJSON() as unknown as IOrganizationMember;
  },

  /** Get a member record. Throws 404 if not found or inactive. */
  async getMember(organizationId: string, userId: string): Promise<IOrganizationMember> {
    const member = await OrganizationMemberModel.findOne({ organizationId, userId, status: 'active' });
    if (!member) throw new ApiError(404, 'Member not found', 'MEMBER_NOT_FOUND');
    return member.toJSON() as unknown as IOrganizationMember;
  },

  /** List all active members of an organization. */
  async listMembers(organizationId: string): Promise<IOrganizationMember[]> {
    const members = await OrganizationMemberModel.find({ organizationId, status: 'active' });
    return members.map(m => m.toJSON() as unknown as IOrganizationMember);
  },

  /** Update a member's role. */
  async updateMemberRole(organizationId: string, userId: string, role: MemberRole): Promise<IOrganizationMember> {
    const member = await OrganizationMemberModel.findOneAndUpdate(
      { organizationId, userId },
      { $set: { role } },
      { new: true }
    );
    if (!member) throw new ApiError(404, 'Member not found', 'MEMBER_NOT_FOUND');
    return member.toJSON() as unknown as IOrganizationMember;
  },

  /** Remove a member from an organization (set inactive). */
  async removeMember(organizationId: string, userId: string): Promise<void> {
    await OrganizationMemberModel.findOneAndUpdate(
      { organizationId, userId },
      { $set: { status: 'inactive' } }
    );
  },

  /** Look up which organization a user belongs to (first active membership). */
  async findOrganizationForUser(userId: string): Promise<string | null> {
    const member = await OrganizationMemberModel.findOne({ userId, status: 'active' });
    return member ? member.organizationId : null;
  },
};
