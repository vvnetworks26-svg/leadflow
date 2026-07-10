/**
 * TaskService.ts — CRM task management.
 */

import { TaskModel, ITask, TaskType, TaskPriority } from '../../models/Task.model';
import { ApiError }              from '../../middleware/errorHandler';
import { PaginatedResult, paginated } from '../../utils/query';
import { WorkflowEngine }        from '../../automation/engine/WorkflowEngine';

export interface CreateTaskDto {
  type?:       TaskType;
  title:       string;
  description?:string;
  leadId?:     string | null;
  contactId?:  string | null;
  companyId?:  string | null;
  ownerId?:    string | null;
  priority?:   TaskPriority;
  dueDate?:    string | null;
  reminderAt?: string | null;
  recurrence?: ITask['recurrence'];
}

export interface TaskQuery {
  ownerId?:   string;
  leadId?:    string;
  completed?: boolean;
  overdue?:   boolean;
  priority?:  TaskPriority;
  type?:      TaskType;
  page?:      number;
  limit?:     number;
  sortBy?:    string;
  order?:     'asc' | 'desc';
}

export const TaskService = {

  async list(organizationId: string, q: TaskQuery): Promise<PaginatedResult<ITask>> {
    const page  = q.page  ?? 1;
    const limit = q.limit ?? 20;
    const skip  = (page - 1) * limit;
    const filter: Record<string, unknown> = { organizationId };
    if (q.ownerId  !== undefined) filter.ownerId   = q.ownerId;
    if (q.leadId   !== undefined) filter.leadId    = q.leadId;
    if (q.priority !== undefined) filter.priority  = q.priority;
    if (q.type     !== undefined) filter.type      = q.type;
    if (q.completed !== undefined) filter.completed = q.completed;
    if (q.overdue === true) {
      filter.completed = false;
      filter.dueDate   = { $lt: new Date() };
    }
    const [docs, total] = await Promise.all([
      TaskModel.find(filter).sort({ [q.sortBy ?? 'dueDate']: q.order === 'asc' ? 1 : -1, priority: -1 }).skip(skip).limit(limit),
      TaskModel.countDocuments(filter),
    ]);
    return paginated(docs.map(d => d.toJSON() as unknown as ITask), total, { page, limit, skip });
  },

  async getById(organizationId: string, id: string): Promise<ITask> {
    const doc = await TaskModel.findOne({ _id: id, organizationId });
    if (!doc) throw new ApiError(404, 'Task not found', 'TASK_NOT_FOUND');
    return doc.toJSON() as unknown as ITask;
  },

  async create(organizationId: string, dto: CreateTaskDto): Promise<ITask> {
    const doc = await TaskModel.create({
      ...dto,
      organizationId,
      dueDate:    dto.dueDate    ? new Date(dto.dueDate)    : null,
      reminderAt: dto.reminderAt ? new Date(dto.reminderAt) : null,
    });
    const task = doc.toJSON() as unknown as ITask;
    // Fire workflow engine
    WorkflowEngine.trigger('task_created', organizationId, {
      taskId:   task.id,
      title:    task.title,
      type:     task.type,
      priority: task.priority,
      leadId:   task.leadId ?? null,
      ownerId:  task.ownerId ?? null,
    });
    return task;
  },

  async update(organizationId: string, id: string, dto: Partial<CreateTaskDto>): Promise<ITask> {
    const patch: Record<string, unknown> = { ...dto };
    if (dto.dueDate    !== undefined) patch.dueDate    = dto.dueDate    ? new Date(dto.dueDate)    : null;
    if (dto.reminderAt !== undefined) patch.reminderAt = dto.reminderAt ? new Date(dto.reminderAt) : null;
    const doc = await TaskModel.findOneAndUpdate(
      { _id: id, organizationId }, patch, { new: true, runValidators: true }
    );
    if (!doc) throw new ApiError(404, 'Task not found', 'TASK_NOT_FOUND');
    return doc.toJSON() as unknown as ITask;
  },

  async complete(organizationId: string, id: string, userId: string): Promise<ITask> {
    const doc = await TaskModel.findOneAndUpdate(
      { _id: id, organizationId },
      { completed: true, completedAt: new Date(), completedById: userId },
      { new: true }
    );
    if (!doc) throw new ApiError(404, 'Task not found', 'TASK_NOT_FOUND');
    return doc.toJSON() as unknown as ITask;
  },

  async delete(organizationId: string, id: string): Promise<void> {
    const doc = await TaskModel.findOneAndDelete({ _id: id, organizationId });
    if (!doc) throw new ApiError(404, 'Task not found', 'TASK_NOT_FOUND');
  },

  /** Count overdue incomplete tasks for an organization. */
  async countOverdue(organizationId: string): Promise<number> {
    return TaskModel.countDocuments({
      organizationId, completed: false, dueDate: { $lt: new Date() },
    });
  },
};
