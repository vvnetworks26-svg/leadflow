/**
 * AttachmentService.ts — Attachment management with type detection and virus scan hook.
 */

import { CommunicationAttachmentModel, ICommunicationAttachment, AttachmentType } from '../../models/CommunicationAttachment.model';
import { ApiError } from '../../middleware/errorHandler';

const MIME_TO_TYPE: Record<string, AttachmentType> = {
  'image/jpeg': 'image', 'image/png': 'image', 'image/gif': 'image', 'image/webp': 'image',
  'video/mp4': 'video', 'video/webm': 'video',
  'audio/mpeg': 'audio', 'audio/wav': 'audio', 'audio/ogg': 'audio',
  'application/pdf': 'pdf',
  'application/msword': 'document', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/vnd.ms-excel': 'spreadsheet', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'spreadsheet',
  'application/zip': 'archive', 'application/x-rar-compressed': 'archive',
};

const MAX_SIZE = 25 * 1024 * 1024;   // 25 MB

export const AttachmentService = {

  async register(
    organizationId: string,
    messageId:      string,
    threadId:       string,
    data: {
      filename:  string;
      mimeType:  string;
      url:       string;
      sizeBytes: number;
      width?:    number;
      height?:   number;
      duration?: number;
    }
  ): Promise<ICommunicationAttachment> {
    if (data.sizeBytes > MAX_SIZE) throw new ApiError(422, 'File too large (max 25 MB)', 'FILE_TOO_LARGE');
    if (!/^https:/.test(data.url)) throw new ApiError(422, 'URL must be HTTPS', 'INVALID_URL');

    const type = MIME_TO_TYPE[data.mimeType] ?? 'other';
    const doc  = await CommunicationAttachmentModel.create({
      ...data, organizationId, messageId, threadId, type,
      virusScanStatus: 'pending',
    });

    // Trigger async virus scan (mock — replace with ClamAV / cloud AV in production)
    setImmediate(() => {
      CommunicationAttachmentModel.findByIdAndUpdate(doc._id, { virusScanStatus: 'clean' }).catch(() => {});
    });

    return doc.toJSON() as unknown as ICommunicationAttachment;
  },

  async listForThread(organizationId: string, threadId: string): Promise<ICommunicationAttachment[]> {
    const docs = await CommunicationAttachmentModel.find({ organizationId, threadId }).sort({ createdAt: -1 });
    return docs.map(d => d.toJSON() as unknown as ICommunicationAttachment);
  },

  async getById(organizationId: string, id: string): Promise<ICommunicationAttachment> {
    const doc = await CommunicationAttachmentModel.findOne({ _id: id, organizationId });
    if (!doc) throw new ApiError(404, 'Attachment not found', 'ATTACHMENT_NOT_FOUND');
    return doc.toJSON() as unknown as ICommunicationAttachment;
  },
};
