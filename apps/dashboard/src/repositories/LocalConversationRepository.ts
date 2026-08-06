import { Conversation } from '../types';
import { IConversationRepository } from './IConversationRepository';

const STORAGE_KEY = 'leadflow_conversations';

const DEFAULT_CONVERSATIONS: Conversation[] = [
  {
    id: 'conv_1',
    leadName: 'Sarah Jenkins',
    leadPhone: '(555) 876-5432',
    leadEmail: 'sarahj@yahoo.com',
    status: 'active',
    lastMessageAt: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    hvacNeed: 'AC Repair',
    messages: [
      { id: 'm1', sender: 'user', text: 'Hi, my AC is leaking water and the fan is on but there is no cold air.', timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString() },
      { id: 'm2', sender: 'ai',   text: 'Hello Sarah! I can help you with that immediately. Water leaking from your AC unit usually indicates a clogged condensate drain line or an iced-over evaporator coil. Since it is blowing warm air, we should get a technician out to inspect it. Would you like to schedule an emergency service today?', timestamp: new Date(Date.now() - 14 * 60 * 1000).toISOString() },
      { id: 'm3', sender: 'user', text: 'Yes please, as soon as possible. It is 85 degrees inside already!', timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString() },
      { id: 'm4', sender: 'ai',   text: 'I completely understand, that is very uncomfortable! I have an emergency dispatch window available today between 2:00 PM and 4:00 PM. Mike Reynolds, our senior technician, can be there. Shall I book this for you?', timestamp: new Date(Date.now() - 8 * 60 * 1000).toISOString() },
      { id: 'm5', sender: 'user', text: 'Yes, book that! My email is sarahj@yahoo.com and address is 894 Peachtree Street NE.', timestamp: new Date(Date.now() - 4 * 60 * 1000).toISOString() },
      { id: 'm6', sender: 'ai',   text: 'Perfect, Sarah! Your emergency service appointment is scheduled for today at 2:30 PM. Technician Mike Reynolds will text you when he is 30 minutes away. I have created your customer ticket. Hang tight, we will get your home cooled down soon!', timestamp: new Date(Date.now() - 3 * 60 * 1000).toISOString() }
    ]
  },
  {
    id: 'conv_2',
    leadName: 'Robert Henderson',
    leadPhone: '(555) 234-5678',
    leadEmail: 'r.henderson@gmail.com',
    status: 'active',
    lastMessageAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    hvacNeed: 'System Replacement Quote',
    messages: [
      { id: 'm10', sender: 'user', text: 'Hello, looking to get a quote to replace my old AC and furnace.', timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 - 30 * 60 * 1000).toISOString() },
      { id: 'm11', sender: 'ai',   text: 'Hi Robert! We would love to provide you with a free system replacement estimate. To ensure we size your system perfectly, we provide a free in-home consultation. Do you prefer a weekday morning or afternoon for our consultant to stop by?', timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 - 28 * 60 * 1000).toISOString() },
      { id: 'm12', sender: 'user', text: "Tomorrow morning works. Let's do 10 AM.", timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 - 25 * 60 * 1000).toISOString() },
      { id: 'm13', sender: 'ai',   text: 'Great choice! I have scheduled Dave Carter, our senior estimator, to visit tomorrow (Monday) at 10:00 AM. He will inspect your current setup, discuss options (like energy-efficient heat pumps or dual-fuel systems), and provide a guaranteed custom quote. You are all set!', timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 - 24 * 60 * 1000).toISOString() }
    ]
  }
];

/**
 * LocalConversationRepository
 *
 * Persists Conversation records to localStorage under 'leadflow_conversations'.
 */
export class LocalConversationRepository implements IConversationRepository {
  private read(): Conversation[] {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      this.write(DEFAULT_CONVERSATIONS);
      return DEFAULT_CONVERSATIONS;
    }
    return JSON.parse(raw) as Conversation[];
  }

  private write(conversations: Conversation[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  }

  findAll(): Conversation[] {
    return this.read();
  }

  findById(id: string): Conversation | undefined {
    return this.read().find(c => c.id === id);
  }

  save(conversation: Conversation): void {
    const convs = this.read();
    const idx = convs.findIndex(c => c.id === conversation.id);
    if (idx !== -1) {
      convs[idx] = conversation;
    } else {
      convs.unshift(conversation);
    }
    this.write(convs);
  }

  saveAll(conversations: Conversation[]): void {
    this.write(conversations);
  }
}

/** Singleton instance used by conversationsApi. */
export const conversationRepository: IConversationRepository = new LocalConversationRepository();
