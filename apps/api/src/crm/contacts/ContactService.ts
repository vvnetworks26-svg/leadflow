/**
 * ContactService.ts — Full contact CRUD + duplicate detection + merge.
 */

import { ContactModel, IContact } from '../../models/Contact.model';
import { ApiError } from '../../middleware/errorHandler';
import { PaginatedResult, paginated } from '../../utils/query';

export interface ContactQuery {
  search?:  string;
  companyId?: string;
  tags?:    string;
  ownerId?: string;
  page?:    number;
  limit?:   number;
  sortBy?:  string;
  order?:   'asc' | 'desc';
}

export interface CreateContactDto {
  firstName:   string;
  lastName?:   string;
  emails?:     string[];
  phones?:     string[];
  jobTitle?:   string;
  companyId?:  string | null;
  leadIds?:    string[];
  timezone?:   string;
  notes?:      string;
  tags?:       string[];
  ownerId?:    string | null;
  socialLinks?:Record<string, string>;
}

export const ContactService = {

  async list(organizationId: string, q: ContactQuery): Promise<PaginatedResult<IContact>> {
    const page  = q.page  ?? 1;
    const limit = q.limit ?? 20;
    const skip  = (page - 1) * limit;
    const filter: Record<string, unknown> = { organizationId };

    if (q.search) {
      filter.$text = { $search: q.search };
    }
    if (q.companyId) filter.companyId = q.companyId;
    if (q.ownerId)   filter.ownerId   = q.ownerId;
    if (q.tags)      filter.tags      = { $in: q.tags.split(',').map(t => t.trim()) };

    const sortField = q.sortBy ?? 'createdAt';
    const sortOrder = q.order  === 'asc' ? 1 : -1;

    const [docs, total] = await Promise.all([
      ContactModel.find(filter).sort({ [sortField]: sortOrder }).skip(skip).limit(limit),
      ContactModel.countDocuments(filter),
    ]);
    return paginated(docs.map(d => d.toJSON() as unknown as IContact), total, { page, limit, skip });
  },

  async getById(organizationId: string, id: string): Promise<IContact> {
    const doc = await ContactModel.findOne({ _id: id, organizationId });
    if (!doc) throw new ApiError(404, 'Contact not found', 'CONTACT_NOT_FOUND');
    return doc.toJSON() as unknown as IContact;
  },

  async create(organizationId: string, dto: CreateContactDto): Promise<IContact> {
    const doc = await ContactModel.create({ ...dto, organizationId });
    return doc.toJSON() as unknown as IContact;
  },

  async update(organizationId: string, id: string, dto: Partial<CreateContactDto>): Promise<IContact> {
    const doc = await ContactModel.findOneAndUpdate(
      { _id: id, organizationId }, dto, { new: true, runValidators: true }
    );
    if (!doc) throw new ApiError(404, 'Contact not found', 'CONTACT_NOT_FOUND');
    return doc.toJSON() as unknown as IContact;
  },

  async delete(organizationId: string, id: string): Promise<void> {
    const doc = await ContactModel.findOneAndDelete({ _id: id, organizationId });
    if (!doc) throw new ApiError(404, 'Contact not found', 'CONTACT_NOT_FOUND');
  },

  /** Find duplicate contacts by email or phone. */
  async findDuplicates(organizationId: string, emails: string[], phones: string[]): Promise<IContact[]> {
    const filter: Record<string, unknown> = {
      organizationId,
      $or: [] as Record<string, unknown>[],
    };
    if (emails.length > 0) (filter.$or as any[]).push({ emails: { $in: emails } });
    if (phones.length > 0) (filter.$or as any[]).push({ phones: { $in: phones } });
    if ((filter.$or as any[]).length === 0) return [];
    const docs = await ContactModel.find(filter).limit(10);
    return docs.map(d => d.toJSON() as unknown as IContact);
  },

  /** Merge sourceId into targetId — target keeps identity, source is deleted. */
  async merge(organizationId: string, targetId: string, sourceId: string): Promise<IContact> {
    const [target, source] = await Promise.all([
      ContactModel.findOne({ _id: targetId, organizationId }),
      ContactModel.findOne({ _id: sourceId, organizationId }),
    ]);
    if (!target) throw new ApiError(404, 'Target contact not found', 'CONTACT_NOT_FOUND');
    if (!source) throw new ApiError(404, 'Source contact not found', 'CONTACT_NOT_FOUND');

    // Merge arrays
    const mergedEmails  = [...new Set([...target.emails, ...source.emails])];
    const mergedPhones  = [...new Set([...target.phones, ...source.phones])];
    const mergedLeadIds = [...new Set([...target.leadIds, ...source.leadIds])];
    const mergedTags    = [...new Set([...target.tags,   ...source.tags])];

    await ContactModel.findByIdAndUpdate(targetId, {
      emails:  mergedEmails,
      phones:  mergedPhones,
      leadIds: mergedLeadIds,
      tags:    mergedTags,
      notes:   [target.notes, source.notes].filter(Boolean).join('\n\n---\n'),
    });
    await ContactModel.findByIdAndDelete(sourceId);
    return ContactService.getById(organizationId, targetId);
  },
};
