/**
 * ImportExportJob.model.ts — Background import/export job tracking.
 */

import { Schema, model, Document } from 'mongoose';

export type JobType    = 'import' | 'export';
export type JobStatus  = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type JobEntity  = 'leads' | 'contacts' | 'companies' | 'bookings' | 'conversations' | 'tasks' | 'activities';

export interface IImportExportJob {
  id:             string;
  organizationId: string;
  type:           JobType;
  entity:         JobEntity;
  status:         JobStatus;
  format:         'csv' | 'json';
  fileUrl:        string | null;   // input for import, output for export
  totalRows:      number;
  processedRows:  number;
  successRows:    number;
  errorRows:      number;
  errorLog:       Array<{ row: number; message: string }>;
  resultUrl:      string | null;
  startedAt:      Date | null;
  completedAt:    Date | null;
  createdById:    string;
  createdAt:      Date;
}

export interface ImportExportJobDocument extends Omit<IImportExportJob, 'id'>, Document {}

const ImportExportJobSchema = new Schema<ImportExportJobDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    type:           { type: String, enum: ['import','export'], required: true },
    entity:         { type: String, required: true },
    status:         { type: String, enum: ['pending','running','completed','failed','cancelled'], default: 'pending' },
    format:         { type: String, enum: ['csv','json'], default: 'csv' },
    fileUrl:        { type: String, default: null },
    totalRows:      { type: Number, default: 0 },
    processedRows:  { type: Number, default: 0 },
    successRows:    { type: Number, default: 0 },
    errorRows:      { type: Number, default: 0 },
    errorLog:       { type: Schema.Types.Mixed, default: [] },
    resultUrl:      { type: String, default: null },
    startedAt:      { type: Date, default: null },
    completedAt:    { type: Date, default: null },
    createdById:    { type: String, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, versionKey: false,
    toJSON: { virtuals: true, transform: (_doc, ret) => { ret.id = ret._id.toString(); delete (ret as any)._id; return ret; } },
  }
);

ImportExportJobSchema.index({ organizationId: 1, createdAt: -1 });
export const ImportExportJobModel = model<ImportExportJobDocument>('ImportExportJob', ImportExportJobSchema);
