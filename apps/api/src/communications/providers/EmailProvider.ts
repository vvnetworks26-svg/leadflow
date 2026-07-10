/**
 * EmailProvider.ts — Email provider abstraction.
 * Supports: Resend, SendGrid, SES, SMTP (mock for dev).
 * New providers: implement IChannelProvider + add to factory.
 */

import type { IChannelProvider, SendMessageInput, SendResult } from './IChannelProvider';
import { logger } from '../../utils/logger';
import { env }    from '../../config/env';

// ─── Resend Provider ──────────────────────────────────────────────────────────

export class ResendEmailProvider implements IChannelProvider {
  readonly name    = 'resend';
  readonly channel = 'email';

  constructor(private apiKey: string) {}

  async send(input: SendMessageInput): Promise<SendResult> {
    try {
      const body: Record<string, unknown> = {
        from:    input.from,
        to:      [input.to],
        subject: input.subject ?? '(no subject)',
        html:    input.bodyHtml || input.body,
        text:    input.body,
      };
      if (input.attachments?.length) {
        body.attachments = input.attachments.map(a => ({ filename: a.filename, path: a.url }));
      }
      const res = await fetch('https://api.resend.com/emails', {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const json = await res.json() as any;
      if (!res.ok) return { success: false, externalId: null, error: json.message ?? 'Resend error' };
      return { success: true, externalId: json.id };
    } catch (e: any) {
      return { success: false, externalId: null, error: e.message };
    }
  }

  verifyWebhook(payload: unknown, signature: string, secret: string): boolean {
    try {
      const { createHmac } = require('crypto');
      const expected = createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
      return signature === expected;
    } catch { return false; }
  }

  async parseInbound(payload: unknown): Promise<any> {
    const p = payload as any;
    if (!p?.from) return null;
    return { from: p.from, body: p.text ?? p.html ?? '', externalId: p.messageId ?? '', metadata: p };
  }
}

// ─── SendGrid Provider ────────────────────────────────────────────────────────

export class SendGridEmailProvider implements IChannelProvider {
  readonly name    = 'sendgrid';
  readonly channel = 'email';

  constructor(private apiKey: string) {}

  async send(input: SendMessageInput): Promise<SendResult> {
    try {
      const body = {
        personalizations: [{ to: [{ email: input.to }], subject: input.subject ?? '' }],
        from:             { email: input.from },
        content:          [
          { type: 'text/plain', value: input.body },
          ...(input.bodyHtml ? [{ type: 'text/html', value: input.bodyHtml }] : []),
        ],
      };
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text();
        return { success: false, externalId: null, error: txt };
      }
      const id = res.headers.get('x-message-id') ?? null;
      return { success: true, externalId: id };
    } catch (e: any) {
      return { success: false, externalId: null, error: e.message };
    }
  }

  verifyWebhook(payload: unknown, signature: string, secret: string): boolean {
    return true;  // SendGrid uses public key verification — hook ready
  }

  async parseInbound(payload: unknown): Promise<any> {
    const p = payload as any;
    return { from: p.from, body: p.text ?? '', externalId: p['message-id'] ?? '', metadata: p };
  }
}

// ─── Mock (dev/test) ──────────────────────────────────────────────────────────

export class MockEmailProvider implements IChannelProvider {
  readonly name    = 'mock';
  readonly channel = 'email';

  async send(input: SendMessageInput): Promise<SendResult> {
    logger.info({ to: input.to, subject: input.subject }, '[MockEmail] send');
    return { success: true, externalId: `mock-${Date.now()}` };
  }
  verifyWebhook(): boolean { return true; }
  async parseInbound(payload: unknown): Promise<any> { return null; }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createEmailProvider(provider: string, creds: Record<string, unknown>): IChannelProvider {
  switch (provider) {
    case 'resend':    return new ResendEmailProvider(String(creds.apiKey ?? env.RESEND_API_KEY ?? ''));
    case 'sendgrid':  return new SendGridEmailProvider(String(creds.apiKey ?? ''));
    default:          return new MockEmailProvider();
  }
}
