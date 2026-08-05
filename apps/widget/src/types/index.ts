// ─── Calendar / Scheduling ───────────────────────────────────────────
export interface TimeSlot {
  date: string;
  time: string;
  displayDate: string;
  displayTime: string;
  available: boolean;
}

export interface BookingConfirmation {
  appointmentId: string;
  confirmationNumber: string;
  customerName: string;
  service: string;
  date: string;
  time: string;
  displayDate: string;
  displayTime: string;
  estimatedDuration: number;
  address: string;
}

// ─── Chat Widget ─────────────────────────────────────────────────────

/**
 * AI-driven conversation stage returned by the backend orchestrator.
 * The frontend uses this only for rendering decisions — never for
 * determining what to ask next.
 */
export type ConversationStage =
  | 'greeting'
  | 'discovery'
  | 'qualification'
  | 'recommendation'
  | 'objection'
  | 'booking'
  | 'completed'
  | 'escalated';

/**
 * Booking sub-state managed entirely on the frontend.
 * Activated when the backend returns bookingTriggered: true.
 */
export type BookingPhase =
  | 'idle'
  | 'loadingSlots'
  | 'selectSlot'
  | 'confirmSlot'
  | 'booking'
  | 'booked';

export interface ChatMessage {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  timestamp: Date;
  slots?: TimeSlot[];
  confirmation?: BookingConfirmation;
}

export interface BookingState {
  phase: BookingPhase;
  availableSlots: TimeSlot[];
  selectedSlot?: TimeSlot;
  confirmation?: BookingConfirmation;
}

export interface ChatState {
  messages: ChatMessage[];
  conversationId: string | null;
  isTyping: boolean;
  stage: ConversationStage;
  bookingState: BookingState;
  loading: boolean;
  error: string | null;
}

// ─── Legacy aliases ───────────────────────────────────────────────────
/** @deprecated Use ConversationStage */
export type ConversationStep = ConversationStage;
/** @deprecated Not used by AI-driven flow */
export interface ConversationData {
  name?: string;
  service?: string;
  emergency?: boolean;
  zipCode?: string;
  phone?: string;
  email?: string;
  preferredDay?: string;
  availableSlots?: TimeSlot[];
  selectedSlot?: TimeSlot;
  bookingConfirmation?: BookingConfirmation;
}

// ─── Notification types (used by notificationService stub) ───────────
export type NotificationType = 'success' | 'info' | 'warning' | 'error';

export interface ToastNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: Date;
}

// ─── Lead / Conversation types (used by widgetApiClient) ─────────────
export type LeadStatus = 'New' | 'Contacted' | 'Qualified' | 'Unqualified' | 'Proposal' | 'Closed Won' | 'Closed Lost';
export type LeadPriority = 'Low' | 'Medium' | 'High';

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  zipCode?: string;
  status: LeadStatus;
  priority: LeadPriority;
  value: number;
  source: string;
  hvacNeed: string;
  emergency?: boolean;
  conversationId?: string;
  qualificationReason?: string;
  preferredDay?: string;
  appointmentId?: string;
  createdAt: string;
  updatedAt?: string;
  notes: string;
}

export interface Message {
  id: string;
  sender: 'ai' | 'user' | 'agent';
  text: string;
  timestamp: string;
}

export interface Conversation {
  id: string;
  leadName: string;
  leadPhone: string;
  leadEmail?: string;
  messages: Message[];
  status: 'active' | 'archived' | 'snoozed' | 'completed';
  lastMessageAt: string;
  hvacNeed?: string;
  leadId?: string;
  appointmentId?: string;
}
