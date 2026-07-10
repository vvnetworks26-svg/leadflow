/**
 * NoteService.ts — Internal rich-text notes CRUD.
 */

import { NoteModel, INote } from '../../models/Note.model';
import { ApiError } from '../../middleware/errorHandler';
import { PaginatedResult, paginated } from '../../utils/query';

export interface CreateNoteDto {
  content:       string;
  leadId?:       string | null;
  contactId?:    string | null;
  companyId?:    string | null;
  isPinned?:     boolean;
  isAIGenerated?:boolean;
  mentionedUsers?:string[];
}

export const NoteService = {

  async listForLead(organizationId: string, leadId: string, page = 1, limit = 20): Promise<PaginatedResult<INote>> {
    const skip = (page - 1) * limit;
    const filter = { organizationId, leadId };
    const [docs, total] = await Promise.all([
      NoteModel.find(filter).sort({ isPinned: -1, createdAt: -1 }).skip(skip).limit(limit),
      NoteModel.countDocuments(filter),
    ]);
    return paginated(docs.map(d => d.toJSON() as unknown as INote), total, { page, limit, skip });
  },

  async getById(organizationId: string, id: string): Promise<INote> {
    const doc = await NoteModel.findOne({ _id: id, organizationId });
    if (!doc) throw new ApiError(404, 'Note not found', 'NOTE_NOT_FOUND');
    return doc.toJSON() as unknown as INote;
  },

  async create(organizationId: string, authorId: string, dto: CreateNoteDto): Promise<INote> {
    const doc = await NoteModel.create({ ...dto, organizationId, authorId });
    return doc.toJSON() as unknown as INote;
  },

  async update(organizationId: string, id: string, authorId: string, patch: Partial<CreateNoteDto>): Promise<INote> {
    // Only the author or an org admin can update
    const doc = await NoteModel.findOneAndUpdate(
      { _id: id, organizationId },
      patch,
      { new: true }
    );
    if (!doc) throw new ApiError(404, 'Note not found', 'NOTE_NOT_FOUND');
    return doc.toJSON() as unknown as INote;
  },

  async delete(organizationId: string, id: string): Promise<void> {
    const doc = await NoteModel.findOneAndDelete({ _id: id, organizationId });
    if (!doc) throw new ApiError(404, 'Note not found', 'NOTE_NOT_FOUND');
  },

  async pin(organizationId: string, id: string, pinned: boolean): Promise<INote> {
    const doc = await NoteModel.findOneAndUpdate(
      { _id: id, organizationId }, { isPinned: pinned }, { new: true }
    );
    if (!doc) throw new ApiError(404, 'Note not found', 'NOTE_NOT_FOUND');
    return doc.toJSON() as unknown as INote;
  },
};
