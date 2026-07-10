/**
 * ChannelAccount.model.ts
 *
 * Connected channel accounts per organization.
 * One document per channel type per org (email, SMS, WhatsApp, etc.).
 * Credentials are hidden from toJSON.
 */

import { Schema, model, Document } from 'mongoose';

export type ChannelAccountType = 'email' | 'sms' | 'whatsapp' | 'messenger' | 'instagram' | 'voice';
export type EmailProvider       = 'smtp' | 'resend' | 'sendgrid' | 'ses';
export type SmsProvider         = 'twilio' | 'vonage' | 'mock';
export type WhatsAppProvider    = 'meta_cloud' | 'mock';

export interface IChannelAccount {
  id:             string;
  organizationId: string;
  channelType:    ChannelAccountType;
  provider:       string;
  name:           string;
  fromAddress:    string;     // email address, phone number, or page ID
  displayName:    string;
  isActive:       boolean;
  isVerified:     boolean;
  credentials:    Record<string, unknown>;   // hidden from toJSON
  webhookUrl:     string;
  metadata:       Record<string, unknown>;
  createdAt:      Date;
  updatedAt:      Date;
}

export interface ChannelAccountDocument extends Omit<IChannelAccount, 'id'>, Document {}

const ChannelAccountSchema = new Schema<ChannelAccountDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    channelType:    { type: String, enum: ['email','sms','whatsapp','messenger','instagram','voice'], required: true },
    provider:       { type: String, required: true },
    name:           { type: String, required: true },
    fromAddress:    { type: String, required: true },
    displayName:    { type: String, default: '' },
    isActive:       { type: Boolean, default: true },
    isVerified:     { type: Boolean, default: false },
    credentials:    { type: Schema.Types.Mixed, default: {}, select: false },
    webhookUrl:     { type: String, default: '' },
    metadata:       { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true, versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        delete (ret as any)._id;
        delete (ret as any).credentials;
        return ret;
      },
    },
  }
);

ChannelAccountSchema.index({ organizationId: 1, channelType: 1 });

export const ChannelAccountModel = model<ChannelAccountDocument>('ChannelAccount', ChannelAccountSchema);
