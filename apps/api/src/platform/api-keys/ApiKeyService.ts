/**
 * ApiKeyService.ts — API key management with hash storage, scopes, and audit.
 */

import { randomBytes, createHash } from 'crypto';
import { ApiKeyModel, IApiKey }    from '../../models/ApiKey.model';
import { PlatformAuditLogModel }   from '../../models/PlatformAuditLog.model';
import { ApiError }                from '../../middleware/errorHandler';

function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function generateRawKey(): string {
  return 'lf_' + randomBytes(32).toString('hex');
}

export const ApiKeyService = {

  async list(organizationId: string): Promise<IApiKey[]> {
    const docs = await ApiKeyModel.find({ organizationId, revokedAt: null }).sort({ createdAt: -1 });
    return docs.map(d => d.toJSON() as unknown as IApiKey);
  },

  /** Create a new API key. Returns the raw key ONCE — not stored in DB. */
  async create(
    organizationId: string,
    userId:         string,
    data: { name: string; scopes: string[]; expiresAt?: Date; rateLimit?: number }
  ): Promise<{ apiKey: IApiKey; rawKey: string }> {
    const rawKey = generateRawKey();
    const doc    = await ApiKeyModel.create({
      organizationId,
      name:        data.name,
      keyHash:     hashKey(rawKey),
      keyPrefix:   rawKey.slice(0, 10) + '...',
      scopes:      data.scopes,
      expiresAt:   data.expiresAt ?? null,
      rateLimit:   data.rateLimit ?? 0,
      isActive:    true,
      createdById: userId,
    });

    PlatformAuditLogModel.create({ organizationId, event: 'api_key.created', actorId: userId, actorType: 'user', resourceType: 'api_key', resourceId: doc.id, ipAddress: '', userAgent: '', before: {}, after: { name: data.name }, metadata: {} }).catch(() => {});

    return { apiKey: doc.toJSON() as unknown as IApiKey, rawKey };
  },

  /** Rotate an API key — creates new raw key, invalidates old hash. */
  async rotate(organizationId: string, id: string, userId: string): Promise<{ apiKey: IApiKey; rawKey: string }> {
    const rawKey = generateRawKey();
    const doc    = await ApiKeyModel.findOneAndUpdate(
      { _id: id, organizationId, revokedAt: null },
      { keyHash: hashKey(rawKey), keyPrefix: rawKey.slice(0, 10) + '...', lastUsedAt: null },
      { new: true }
    );
    if (!doc) throw new ApiError(404, 'API key not found', 'KEY_NOT_FOUND');
    PlatformAuditLogModel.create({ organizationId, event: 'api_key.rotated', actorId: userId, actorType: 'user', resourceType: 'api_key', resourceId: id, ipAddress: '', userAgent: '', before: {}, after: {}, metadata: {} }).catch(() => {});
    return { apiKey: doc.toJSON() as unknown as IApiKey, rawKey };
  },

  /** Revoke an API key. */
  async revoke(organizationId: string, id: string, userId: string): Promise<void> {
    const doc = await ApiKeyModel.findOneAndUpdate(
      { _id: id, organizationId }, { revokedAt: new Date(), revokedById: userId, isActive: false }
    );
    if (!doc) throw new ApiError(404, 'API key not found', 'KEY_NOT_FOUND');
    PlatformAuditLogModel.create({ organizationId, event: 'api_key.revoked', actorId: userId, actorType: 'user', resourceType: 'api_key', resourceId: id, ipAddress: '', userAgent: '', before: {}, after: {}, metadata: {} }).catch(() => {});
  },

  /** Validate an inbound API key (called from auth middleware). */
  async validate(rawKey: string): Promise<{ organizationId: string; scopes: string[] } | null> {
    if (!rawKey) return null;
    const doc = await ApiKeyModel.findOne({
      keyHash:   hashKey(rawKey),
      isActive:  true,
      revokedAt: null,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    }).select('+keyHash');

    if (!doc) return null;

    // Update usage tracking
    await ApiKeyModel.findByIdAndUpdate(doc._id, {
      lastUsedAt: new Date(),
      $inc: { usageCount: 1 },
    });

    return { organizationId: doc.organizationId, scopes: doc.scopes };
  },
};
