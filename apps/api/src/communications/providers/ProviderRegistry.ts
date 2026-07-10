/**
 * ProviderRegistry.ts — Loads the correct provider for a channel account.
 */

import { ChannelAccountModel }     from '../../models/ChannelAccount.model';
import { createEmailProvider }     from './EmailProvider';
import { createSmsProvider }       from './SmsProvider';
import { createWhatsAppProvider }  from './WhatsAppProvider';
import type { IChannelProvider }   from './IChannelProvider';
import type { ThreadChannel }      from '../../models/ConversationThread.model';

// Mock providers for channels without full implementations yet
class MockProvider implements IChannelProvider {
  constructor(readonly name: string, readonly channel: string) {}
  async send(): Promise<any> { return { success: true, externalId: `mock-${Date.now()}` }; }
  verifyWebhook(): boolean { return true; }
  async parseInbound(): Promise<any> { return null; }
}

export async function getProvider(
  organizationId: string,
  channel:        ThreadChannel,
): Promise<IChannelProvider | null> {
  const account = await ChannelAccountModel
    .findOne({ organizationId, channelType: channel, isActive: true })
    .select('+credentials')
    .lean();

  if (!account) return new MockProvider(channel + '_mock', channel);

  const creds = (account.credentials ?? {}) as Record<string, unknown>;

  switch (channel) {
    case 'email':     return createEmailProvider(account.provider,     creds);
    case 'sms':       return createSmsProvider(account.provider,       creds);
    case 'whatsapp':  return createWhatsAppProvider(account.provider,  creds);
    case 'messenger': return new MockProvider('messenger_mock', 'messenger');
    case 'instagram': return new MockProvider('instagram_mock', 'instagram');
    case 'voice':     return new MockProvider('voice_mock', 'voice');
    default:          return new MockProvider('mock', channel);
  }
}
