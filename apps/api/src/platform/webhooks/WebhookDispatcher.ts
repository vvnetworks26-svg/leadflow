/**
 * WebhookDispatcher.ts
 *
 * Dispatches outgoing webhook events to subscribed endpoints.
 * Handles retries, HMAC signing, dead-letter queue, and delivery logs.
 * Fire-and-forget from the caller's perspective.
 */

import { createHmac }           from 'crypto';
import { PlatformWebhookModel } from '../../models/PlatformWebhook.model';
import { PlatformAuditLogModel }from '../../models/PlatformAuditLog.model';
import { logger }               from '../../utils/logger';
import type { WebhookEvent }    from '../../models/PlatformWebhook.model';

export const WebhookDispatcher = {

  /**
   * Dispatch an event to all subscribed webhooks for an organization.
   * Fire-and-forget — never blocks the caller.
   */
  dispatch(organizationId: string, event: WebhookEvent, payload: Record<string, unknown>): void {
    WebhookDispatcher._dispatchAsync(organizationId, event, payload)
      .catch(err => logger.warn({ err, event }, '[Webhook] dispatch error'));
  },

  async _dispatchAsync(
    organizationId: string,
    event:          WebhookEvent,
    payload:        Record<string, unknown>,
  ): Promise<void> {
    const hooks = await PlatformWebhookModel.find({
      organizationId,
      isActive: true,
      status:   { $ne: 'paused' },
      $or: [{ events: event }, { events: '*' }],
    }).select('+secret').lean();

    for (const hook of hooks) {
      await WebhookDispatcher._deliver(hook, event, payload, 1);
    }
  },

  async _deliver(
    hook:       any,
    event:      WebhookEvent,
    payload:    Record<string, unknown>,
    attempt:    number,
  ): Promise<void> {
    const retryPolicy = hook.retryPolicy ?? { maxAttempts: 3, backoffSeconds: 60 };
    const body        = JSON.stringify({ event, data: payload, timestamp: new Date().toISOString(), organizationId: hook.organizationId });
    const signature   = 'sha256=' + createHmac('sha256', hook.secret ?? '').update(body).digest('hex');

    const start = Date.now();
    let statusCode = 0;
    let success    = false;
    let error      = null as string | null;

    try {
      const res = await fetch(hook.url, {
        method:  'POST',
        headers: {
          'Content-Type':          'application/json',
          'X-LeadFlow-Signature':  signature,
          'X-LeadFlow-Event':      event,
          'X-LeadFlow-Delivery':   `${hook._id}-${attempt}`,
          ...(hook.headers ?? {}),
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      statusCode = res.status;
      success    = res.ok;
    } catch (e: any) {
      error = e.message;
    }

    const durationMs = Date.now() - start;
    const logEntry   = { attemptedAt: new Date(), statusCode, success, error, durationMs };

    // Update delivery logs (cap at 10)
    await PlatformWebhookModel.findByIdAndUpdate(hook._id, {
      $push:      { deliveryLogs: { $each: [logEntry], $slice: -10 } },
      $inc:       { [success ? 'successCount' : 'failureCount']: 1 },
      lastDeliveredAt: new Date(),
      status:     success ? 'active' : (attempt >= retryPolicy.maxAttempts ? 'failed' : hook.status),
    });

    // Retry on failure
    if (!success && attempt < retryPolicy.maxAttempts) {
      const backoffMs = retryPolicy.backoffSeconds * 1000 * Math.pow(2, attempt - 1);
      setTimeout(() => WebhookDispatcher._deliver(hook, event, payload, attempt + 1), backoffMs);
    }

    // Audit log
    PlatformAuditLogModel.create({
      organizationId: hook.organizationId,
      event:          success ? 'webhook.delivered' : 'webhook.failed',
      actorType:      'system',
      resourceType:   'webhook',
      resourceId:     hook._id.toString(),
      ipAddress:      '',
      userAgent:      '',
      before:         {},
      after:          { event, success, statusCode, attempt },
      metadata:       {},
    }).catch(() => {});
  },

  async list(organizationId: string) {
    return PlatformWebhookModel.find({ organizationId }).sort({ createdAt: -1 }).lean();
  },

  async create(organizationId: string, userId: string, data: {
    name: string; url: string; events: WebhookEvent[]; headers?: Record<string, string>
  }) {
    const { randomBytes } = require('crypto');
    const secret = randomBytes(32).toString('hex');
    const doc    = await PlatformWebhookModel.create({ ...data, organizationId, secret, createdById: userId });
    const result = doc.toJSON() as any;
    result.secret = secret;  // expose once on creation
    return result;
  },

  async delete(organizationId: string, id: string): Promise<void> {
    await PlatformWebhookModel.findOneAndDelete({ _id: id, organizationId });
  },

  /** Replay the last payload to a webhook (for testing). */
  async replay(organizationId: string, id: string): Promise<void> {
    const hook = await PlatformWebhookModel.findOne({ _id: id, organizationId }).select('+secret').lean();
    if (!hook) return;
    await WebhookDispatcher._deliver(hook, 'lead.created', { test: true, replay: true }, 1);
  },
};
