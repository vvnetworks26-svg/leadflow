/**
 * WhatsAppProvider.ts — Meta Cloud API abstraction for WhatsApp.
 */

import type { IChannelProvider, SendMessageInput, SendResult } from './IChannelProvider';
import { logger } from '../../utils/logger';
import { env }    from '../../config/env';

export class MetaWhatsAppProvider implements IChannelProvider {
  readonly name    = 'meta_cloud';
  readonly channel = 'whatsapp';

  constructor(
    private phoneNumberId: string,
    private accessToken:   string,
  ) {}

  async send(input: SendMessageInput): Promise<SendResult> {
    try {
      const res = await fetch(
        `https://graph.facebook.com/v18.0/${this.phoneNumberId}/messages`,
        {
          method:  'POST',
          headers: { 'Authorization': `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type:    'individual',
            to:                input.to.replace(/\D/g, ''),
            type:              'text',
            text:              { preview_url: false, body: input.body },
          }),
        }
      );
      const json = await res.json() as any;
      if (!res.ok) return { success: false, externalId: null, error: json.error?.message };
      return { success: true, externalId: json.messages?.[0]?.id ?? null };
    } catch (e: any) {
      return { success: false, externalId: null, error: e.message };
    }
  }

  verifyWebhook(payload: unknown, signature: string, secret: string): boolean {
    try {
      const { createHmac } = require('crypto');
      const expected = 'sha256=' + createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
      return signature === expected;
    } catch { return false; }
  }

  async parseInbound(payload: unknown): Promise<any> {
    try {
      const p    = payload as any;
      const entry = p.entry?.[0]?.changes?.[0]?.value;
      if (!entry) return null;
      const msg   = entry.messages?.[0];
      if (!msg) return null;
      const contact = entry.contacts?.[0];
      return {
        from:       contact?.wa_id ?? msg.from,
        body:       msg.text?.body ?? msg.caption ?? '',
        externalId: msg.id,
        metadata:   { name: contact?.profile?.name, type: msg.type, ...entry },
      };
    } catch { return null; }
  }
}

export class MockWhatsAppProvider implements IChannelProvider {
  readonly name    = 'mock';
  readonly channel = 'whatsapp';

  async send(input: SendMessageInput): Promise<SendResult> {
    logger.info({ to: input.to }, '[MockWhatsApp] send');
    return { success: true, externalId: `mock-wa-${Date.now()}` };
  }
  verifyWebhook(): boolean { return true; }
  async parseInbound(payload: unknown): Promise<any> { return null; }
}

export function createWhatsAppProvider(provider: string, creds: Record<string, unknown>): IChannelProvider {
  switch (provider) {
    case 'meta_cloud': return new MetaWhatsAppProvider(String(creds.phoneNumberId ?? env.META_WA_PHONE_ID ?? ''), String(creds.accessToken ?? env.META_WA_TOKEN ?? ''));
    default:           return new MockWhatsAppProvider();
  }
}
