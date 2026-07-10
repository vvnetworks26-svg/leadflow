/**
 * CompanyService.ts — Company CRUD + duplicate detection.
 */

import { CompanyModel, ICompany } from '../../models/Company.model';
import { ContactModel } from '../../models/Contact.model';
import { LeadModel } from '../../models/Lead.model';
import { ApiError } from '../../middleware/errorHandler';
import { PaginatedResult, paginated } from '../../utils/query';

export interface CompanyQuery {
  search?:    string;
  industry?:  string;
  ownerId?:   string;
  tags?:      string;
  page?:      number;
  limit?:     number;
  sortBy?:    string;
  order?:     'asc' | 'desc';
}

export interface CreateCompanyDto {
  name:          string;
  domain?:       string;
  website?:      string;
  industry?:     string;
  employeeCount?:number | null;
  annualRevenue?:number | null;
  phone?:        string;
  email?:        string;
  address?:      string;
  city?:         string;
  state?:        string;
  country?:      string;
  description?:  string;
  tags?:         string[];
  ownerId?:      string | null;
  customFields?: Record<string, unknown>;
}

export const CompanyService = {

  async list(organizationId: string, q: CompanyQuery): Promise<PaginatedResult<ICompany>> {
    const page  = q.page  ?? 1;
    const limit = q.limit ?? 20;
    const skip  = (page - 1) * limit;
    const filter: Record<string, unknown> = { organizationId };
    if (q.search)   filter.$text     = { $search: q.search };
    if (q.industry) filter.industry  = q.industry;
    if (q.ownerId)  filter.ownerId   = q.ownerId;
    if (q.tags)     filter.tags      = { $in: q.tags.split(',').map(t => t.trim()) };
    const sortOrder = q.order === 'asc' ? 1 : -1;
    const [docs, total] = await Promise.all([
      CompanyModel.find(filter).sort({ [q.sortBy ?? 'createdAt']: sortOrder }).skip(skip).limit(limit),
      CompanyModel.countDocuments(filter),
    ]);
    return paginated(docs.map(d => d.toJSON() as unknown as ICompany), total, { page, limit, skip });
  },

  async getById(organizationId: string, id: string): Promise<ICompany> {
    const doc = await CompanyModel.findOne({ _id: id, organizationId });
    if (!doc) throw new ApiError(404, 'Company not found', 'COMPANY_NOT_FOUND');
    return doc.toJSON() as unknown as ICompany;
  },

  async create(organizationId: string, dto: CreateCompanyDto): Promise<ICompany> {
    const doc = await CompanyModel.create({ ...dto, organizationId });
    return doc.toJSON() as unknown as ICompany;
  },

  async update(organizationId: string, id: string, dto: Partial<CreateCompanyDto>): Promise<ICompany> {
    const doc = await CompanyModel.findOneAndUpdate(
      { _id: id, organizationId }, dto, { new: true, runValidators: true }
    );
    if (!doc) throw new ApiError(404, 'Company not found', 'COMPANY_NOT_FOUND');
    return doc.toJSON() as unknown as ICompany;
  },

  async delete(organizationId: string, id: string): Promise<void> {
    const doc = await CompanyModel.findOneAndDelete({ _id: id, organizationId });
    if (!doc) throw new ApiError(404, 'Company not found', 'COMPANY_NOT_FOUND');
  },

  /** Get summary stats for a company. */
  async getStats(organizationId: string, companyId: string) {
    const [contactCount, leadCount, revenue] = await Promise.all([
      ContactModel.countDocuments({ organizationId, companyId }),
      LeadModel.countDocuments({ organizationId, company: { $exists: true } }),
      LeadModel.aggregate([
        { $match: { organizationId, status: 'Closed Won' } },
        { $group: { _id: null, total: { $sum: '$value' } } },
      ]),
    ]);
    return {
      contactCount,
      leadCount,
      totalRevenue: revenue[0]?.total ?? 0,
    };
  },

  /** Find companies with same domain or similar name. */
  async findDuplicates(organizationId: string, name: string, domain?: string): Promise<ICompany[]> {
    const filter: Record<string, unknown> = { organizationId, $or: [] as any[] };
    (filter.$or as any[]).push({ name: { $regex: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } });
    if (domain) (filter.$or as any[]).push({ domain });
    const docs = await CompanyModel.find(filter).limit(5);
    return docs.map(d => d.toJSON() as unknown as ICompany);
  },
};
