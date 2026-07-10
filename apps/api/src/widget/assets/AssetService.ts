/**
 * AssetService.ts
 *
 * Manages widget branding assets (logos, avatars, icons, backgrounds, fonts).
 * Validates file types and size. URL stored — actual file storage is external (S3/CDN).
 */

import { WidgetAssetModel, IWidgetAsset, AssetType } from '../../models/WidgetAsset.model';
import { ApiError } from '../../middleware/errorHandler';

const ALLOWED_MIME_TYPES: Record<AssetType, string[]> = {
  logo:       ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'],
  avatar:     ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  icon:       ['image/png', 'image/svg+xml', 'image/x-icon'],
  background: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  font:       ['font/woff', 'font/woff2', 'font/ttf', 'application/font-woff'],
  favicon:    ['image/x-icon', 'image/png', 'image/svg+xml'],
};

const MAX_SIZE_BYTES = 5 * 1024 * 1024;   // 5 MB

export const AssetService = {

  async list(organizationId: string, type?: AssetType): Promise<IWidgetAsset[]> {
    const filter: Record<string, unknown> = { organizationId };
    if (type) filter.type = type;
    const docs = await WidgetAssetModel.find(filter).sort({ createdAt: -1 });
    return docs.map(d => d.toJSON() as unknown as IWidgetAsset);
  },

  async register(
    organizationId: string,
    userId:         string,
    data: {
      type:      AssetType;
      name:      string;
      url:       string;
      mimeType:  string;
      sizeBytes: number;
      width?:    number;
      height?:   number;
    }
  ): Promise<IWidgetAsset> {
    // Validate MIME type
    const allowed = ALLOWED_MIME_TYPES[data.type] ?? [];
    if (!allowed.includes(data.mimeType)) {
      throw new ApiError(422, `Invalid file type ${data.mimeType} for asset type ${data.type}`, 'INVALID_MIME_TYPE');
    }

    // Validate size
    if (data.sizeBytes > MAX_SIZE_BYTES) {
      throw new ApiError(422, `File size ${data.sizeBytes} exceeds maximum ${MAX_SIZE_BYTES} bytes`, 'FILE_TOO_LARGE');
    }

    // Validate URL
    try {
      const u = new URL(data.url);
      if (u.protocol !== 'https:') throw new Error('HTTPS required');
    } catch {
      throw new ApiError(422, 'Asset URL must be a valid HTTPS URL', 'INVALID_URL');
    }

    const doc = await WidgetAssetModel.create({ ...data, organizationId, uploadedById: userId });
    return doc.toJSON() as unknown as IWidgetAsset;
  },

  async delete(organizationId: string, id: string): Promise<void> {
    const doc = await WidgetAssetModel.findOneAndDelete({ _id: id, organizationId });
    if (!doc) throw new ApiError(404, 'Asset not found', 'ASSET_NOT_FOUND');
  },

  getAllowedMimeTypes(): Record<AssetType, string[]> {
    return ALLOWED_MIME_TYPES;
  },
};
