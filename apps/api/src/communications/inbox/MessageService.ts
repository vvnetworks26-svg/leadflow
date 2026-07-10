/**
 * MessageService.ts — Send messages and handle inbound delivery.
 */

import { randomUUID }                from 'crypto';
import { CommunicationMessageModel, ICommunicationMessage } from '../../models/CommunicationMessage.model';
import { ConversationThreadModel }   from '../../models/ConversationThread.model';
import { getProvider }               from '../providers/ProviderRegistry';
import { renderTemplate }            from '../templates/TemplateEngine';
import { broadcast }                 from '../../dashboard/realtime/SseService';
import { ApiError }                  from '../../middleware/errorHandler';
import type { ThreadChannel }        from '../../models/ConversationThread.model';
import type { MessageDirection }     from '../../models/CommunicationMessage.model';

export interface SendMessageInput {
  organizationId: string;
  threadId:       string;
  channel:        ThreadChannel;
  direction:      MessageDirection;
  from:           string;
  to:             string;
  subject?:       string;
  body:           string;
  bodyHtml?:      string;
  senderId?:      string;
  senderName?:    string;
  templateId?:    string;
  templateVars?:  Record<string, unknown>;
  scheduledAt?:   Date;
  metadata?:      Record<string, unknown>;
}

export const MessageService = {

  async send(input: SendMessageInput): Promise<ICommunicationMessage> {
    const { organizationId, threadId, channel } = input;

    // Render template if provided
    let body     = input.body;
    let bodyHtml = input.bodyHtml ?? '';
    let subject  = input.subject ?? '';

    if (input.templateId && input.templateVars) {
      const { TemplateEngine } = require('../templates/TemplateEngine');
      const rendered = await TemplateEngine.render(organizationId, input.templateId, input.templateVars);
      body = rendered.body; bodyHtml = rendered.bodyHtml; subject = rendered.subject;
    }

    // Create message record
    const msg = await CommunicationMessageModel.create({
      organizationId,
      threadId,
      channel,
      direction:   input.direction,
      messageType: bodyHtml ? 'html' : 'text',
      status:      input.scheduledAt ? 'pending' : 'pending',
      fromAddress: input.from,
      toAddresses: [input.to],
      subject,
      body,
      bodyHtml,
      senderId:    input.senderId ?? null,
      senderName:  input.senderName ?? '',
      externalId:  null,
      metadata:    input.metadata ?? {},
      scheduledAt: input.scheduledAt ?? null,
    });

    // If not scheduled, send immediately
    if (!input.scheduledAt && input.direction === 'outbound') {
      const provider = await getProvider(organizationId, channel);
      if (provider) {
        const result = await provider.send({ to: input.to, from: input.from, subject, body, bodyHtml });
        await CommunicationMessageModel.findByIdAndUpdate(msg._id, {
          status:     result.success ? 'sent' : 'failed',
          externalId: result.externalId,
          failureReason: result.error ?? null,
          failedAt:   result.success ? null : new Date(),
        });
      }
    }

    // Update thread snippet and counters
    await ConversationThreadModel.findByIdAndUpdate(threadId, {
      snippet:       body.slice(0, 100),
      lastMessageAt: new Date(),
      lastMessageBy: input.senderId ?? null,
      $inc: {
        messageCount: 1,
        unreadCount:  input.direction === 'inbound' ? 1 : 0,
      },
      $addToSet: { channels: channel },
    });

    const result = msg.toJSON() as unknown as ICommunicationMessage;

    // Push SSE event
    broadcast(organizationId, 'lead_created', {
      event: 'new_message', threadId, messageId: result.id, channel, direction: input.direction,
    });

    return result;
  },

  /** Handle inbound message from a webhook. Creates/updates thread automatically. */
  async receiveInbound(
    organizationId: string,
    channel:        ThreadChannel,
    from:           string,
    body:           string,
    externalId:     string,
    metadata?:      Record<string, unknown>,
  ): Promise<ICommunicationMessage> {
    // Find or create thread by sender address
    let thread = await ConversationThreadModel.findOne({
      organizationId, deletedAt: null,
      $or: [
        { 'metadata.from': from },
        { channels: channel },
      ],
    }).sort({ lastMessageAt: -1 });

    if (!thread) {
      thread = await ConversationThreadModel.create({
        organizationId,
        channels: [channel],
        subject:  body.slice(0, 80),
        snippet:  body.slice(0, 100),
        status:   'open',
        metadata: { from },
      });
    }

    return MessageService.send({
      organizationId,
      threadId:  thread._id.toString(),
      channel,
      direction: 'inbound',
      from,
      to:        'inbox',
      body,
      metadata,
    });
  },

  async getById(organizationId: string, id: string): Promise<ICommunicationMessage> {
    const doc = await CommunicationMessageModel.findOne({ _id: id, organizationId });
    if (!doc) throw new ApiError(404, 'Message not found', 'MESSAGE_NOT_FOUND');
    return doc.toJSON() as unknown as ICommunicationMessage;
  },

  async delete(organizationId: string, id: string): Promise<void> {
    await CommunicationMessageModel.findOneAndUpdate(
      { _id: id, organizationId }, { deletedAt: new Date() }
    );
  },
};
