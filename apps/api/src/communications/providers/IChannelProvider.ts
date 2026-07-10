/**
 * IChannelProvider.ts — Provider abstraction for all communication channels.
 */

export interface SendMessageInput {
  to:       string;
  from:     string;
  subject?: string;
  body:     string;
  bodyHtml?:string;
  attachments?: Array<{ filename: string; url: string; mimeType: string }>;
  metadata?:Record<string, unknown>;
}

export interface SendResult {
  success:    boolean;
  externalId: string | null;
  error?:     string;
}

export interface DeliveryStatus {
  externalId: string;
  status:     'delivered' | 'read' | 'failed' | 'bounced';
  timestamp:  Date;
  metadata?:  Record<string, unknown>;
}

export interface IChannelProvider {
  readonly name:    string;
  readonly channel: string;

  /** Send a message and return the external message ID. */
  send(input: SendMessageInput): Promise<SendResult>;

  /** Verify webhook signature (provider-specific). */
  verifyWebhook(payload: unknown, signature: string, secret: string): boolean;

  /** Parse an inbound webhook payload into a normalized message. */
  parseInbound(payload: unknown): Promise<{
    from:         string;
    body:         string;
    externalId:   string;
    metadata?:    Record<string, unknown>;
  } | null>;
}
