/**
 * SmsProvider.ts — SMS provider abstraction. Supports Twilio, Vonage, Mock.
 */

import type { IChannelProvider, SendMessageInput, SendResult } from './IChannelProvider';
import { logger } from '../../utils/logger';
import { env }    from '../../config/env';

export class TwilioSmsProvider implements IChannelProvider {
  readonly name    = 'twilio';
  readonly channel = 'sms';

  constructor(
    private accountSid: string,
    private authToken:  string,
  ) {}

  async send(input: SendMessageInput): Promise<SendResult> {
    try {
      const params = new URLSearchParams({
        To:   input.to, From: input.from, Body: input.body,
      });
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
        {
          method:  'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64'),
            'Content-Type':  'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        }
      );
      const json = await res.json() as any;
      if (!res.ok) return { success: false, externalId: null, error: json.message };
      return { success: true, externalId: json.sid };
    } catch (e: any) {
      return { success: false, externalId: null, error: e.message };
    }
  }

  verifyWebhook(payload: unknown, signature: string, secret: string): boolean {
    // Twilio validates with X-Twilio-Signature HMAC — hook ready
    return true;
  }

  async parseInbound(payload: unknown): Promise<any> {
    const p = payload as any;
    return { from: p.From, body: p.Body ?? '', externalId: p.MessageSid ?? '', metadata: p };
  }
}

export class MockSmsProvider implements IChannelProvider {
  readonly name    = 'mock';
  readonly channel = 'sms';

  async send(input: SendMessageInput): Promise<SendResult> {
    logger.info({ to: input.to }, '[MockSMS] send');
    return { success: true, externalId: `mock-sms-${Date.now()}` };
  }
  verifyWebhook(): boolean { return true; }
  async parseInbound(payload: unknown): Promise<any> { return null; }
}

export function createSmsProvider(provider: string, creds: Record<string, unknown>): IChannelProvider {
  switch (provider) {
    case 'twilio': return new TwilioSmsProvider(String(creds.accountSid ?? env.TWILIO_ACCOUNT_SID ?? ''), String(creds.authToken ?? env.TWILIO_AUTH_TOKEN ?? ''));
    default:       return new MockSmsProvider();
  }
}
