import { LeadModel } from '../models/Lead.model';
import { ApiError } from '../middleware/errorHandler';
import { CreateLeadDto, UpdateLeadDto, LeadQueryDto } from '../dto/lead.dto';
import { Lead } from '../types';
import { PaginatedResult, paginated } from '../utils/query';

export const LeadService = {
  async list(q: LeadQueryDto): Promise<PaginatedResult<Lead>> {
    const page  = q.page  ?? 1;
    const limit = q.limit ?? 20;
    const skip  = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (q.status)   filter.status   = q.status;
    if (q.priority) filter.priority = q.priority;
    if (q.source)   filter.source   = q.source;
    if (q.search) {
      const re = new RegExp(q.search, 'i');
      filter.$or = [{ name: re }, { email: re }, { phone: re }, { hvacNeed: re }];
    }

    const sortField = q.sortBy ?? 'createdAt';
    const sortOrder = q.order  === 'asc' ? 1 : -1;

    const [docs, total] = await Promise.all([
      LeadModel.find(filter).sort({ [sortField]: sortOrder }).skip(skip).limit(limit),
      LeadModel.countDocuments(filter),
    ]);

    return paginated(docs.map(d => d.toJSON() as unknown as Lead), total, { page, limit, skip });
  },

  async getById(id: string): Promise<Lead> {
    const doc = await LeadModel.findById(id);
    if (!doc) throw new ApiError(404, 'Lead not found', 'LEAD_NOT_FOUND');
    return doc.toJSON() as unknown as Lead;
  },

  async create(dto: CreateLeadDto): Promise<Lead> {
    const doc = await LeadModel.create(dto);
    return doc.toJSON() as unknown as Lead;
  },

  async update(id: string, dto: UpdateLeadDto): Promise<Lead> {
    const doc = await LeadModel.findByIdAndUpdate(id, dto, { new: true, runValidators: true });
    if (!doc) throw new ApiError(404, 'Lead not found', 'LEAD_NOT_FOUND');
    return doc.toJSON() as unknown as Lead;
  },

  async delete(id: string): Promise<void> {
    const doc = await LeadModel.findByIdAndDelete(id);
    if (!doc) throw new ApiError(404, 'Lead not found', 'LEAD_NOT_FOUND');
  },
};
