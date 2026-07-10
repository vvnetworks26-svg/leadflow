import { AppointmentModel } from '../models/Appointment.model';
import { ApiError } from '../middleware/errorHandler';
import { CreateAppointmentDto, UpdateAppointmentDto, AppointmentQueryDto } from '../dto/appointment.dto';
import { Appointment } from '../types';
import { PaginatedResult, paginated } from '../utils/query';

export const AppointmentService = {
  async list(organizationId: string, q: AppointmentQueryDto): Promise<PaginatedResult<Appointment>> {
    const page  = q.page  ?? 1;
    const limit = q.limit ?? 20;
    const skip  = (page - 1) * limit;

    const filter: Record<string, unknown> = { organizationId };
    if (q.status) filter.status = q.status;
    if (q.type)   filter.type   = q.type;
    if (q.leadId) filter.leadId = q.leadId;
    if (q.date)   filter.date   = q.date;
    if (q.search) {
      const re = new RegExp(q.search, 'i');
      filter.$or = [{ leadName: re }, { leadPhone: re }];
    }

    const sortField = q.sortBy ?? 'date';
    const sortOrder = q.order  === 'asc' ? 1 : -1;

    const [docs, total] = await Promise.all([
      AppointmentModel.find(filter).sort({ [sortField]: sortOrder }).skip(skip).limit(limit),
      AppointmentModel.countDocuments(filter),
    ]);

    return paginated(docs.map(d => d.toJSON() as unknown as Appointment), total, { page, limit, skip });
  },

  async getById(organizationId: string, id: string): Promise<Appointment> {
    const doc = await AppointmentModel.findOne({ _id: id, organizationId });
    if (!doc) throw new ApiError(404, 'Appointment not found', 'APPOINTMENT_NOT_FOUND');
    return doc.toJSON() as unknown as Appointment;
  },

  async create(organizationId: string, dto: CreateAppointmentDto): Promise<Appointment> {
    const doc = await AppointmentModel.create({ ...dto, organizationId });
    return doc.toJSON() as unknown as Appointment;
  },

  async update(organizationId: string, id: string, dto: UpdateAppointmentDto): Promise<Appointment> {
    const doc = await AppointmentModel.findOneAndUpdate(
      { _id: id, organizationId },
      dto,
      { new: true, runValidators: true }
    );
    if (!doc) throw new ApiError(404, 'Appointment not found', 'APPOINTMENT_NOT_FOUND');
    return doc.toJSON() as unknown as Appointment;
  },

  async cancel(organizationId: string, id: string): Promise<Appointment> {
    return AppointmentService.update(organizationId, id, { status: 'Canceled' });
  },

  /** Count appointments for an organization. */
  async countByOrganization(organizationId: string): Promise<number> {
    return AppointmentModel.countDocuments({ organizationId });
  },

  /** Stats breakdown (by status) for an organization's appointments. */
  async statsByOrganization(organizationId: string): Promise<Record<string, number>> {
    const results = await AppointmentModel.aggregate([
      { $match: { organizationId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    return results.reduce((acc, r) => ({ ...acc, [r._id]: r.count }), {});
  },
};
