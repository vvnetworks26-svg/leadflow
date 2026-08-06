export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  imageUrl?: string;
}

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

export type AppointmentStatus = 'Scheduled' | 'Completed' | 'Canceled' | 'No Show' | 'Pending' | 'Confirmed' | 'Rescheduled';
export type AppointmentType = 'Maintenance' | 'Repair Consultation' | 'System Replacement Quote' | 'Emergency Service';

export interface Appointment {
  id: string;
  leadId: string;
  leadName: string;
  leadPhone: string;
  conversationId?: string;
  customerEmail?: string;
  address?: string;
  zipCode?: string;
  confirmationNumber?: string;
  source?: string;
  date: string;
  time: string;
  duration: number;
  type: AppointmentType;
  status: AppointmentStatus;
  notes: string;
  assignedTechnician?: string;
  value?: number;
  createdAt?: string;
  updatedAt?: string;
}

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

// ─── Conversation ────────────────────────────────────────────────────
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

// ─── Dashboard metrics ───────────────────────────────────────────────
export interface DashboardMetrics {
  totalLeads: number;
  leadsChange: number;
  activeAppointments: number;
  appointmentsChange: number;
  conversionRate: number;
  conversionChange: number;
  pipelineValue: number;
  pipelineChange: number;
  todayAppointments: number;
  weekBookings: number;
}

// ─── Notifications ───────────────────────────────────────────────────
export type NotificationType = 'success' | 'info' | 'warning' | 'error';

export interface ToastNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: Date;
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
  | 'idle'         // normal AI conversation
  | 'loadingSlots' // fetching available time slots
  | 'selectSlot'   // slot picker is visible
  | 'confirmSlot'  // user chose a slot, awaiting confirmation
  | 'booking'      // POST /widget/book in flight
  | 'booked';      // booking confirmed

export interface ChatMessage {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  timestamp: Date;
  /** Populated on AI messages that present slot options */
  slots?: TimeSlot[];
  /** Populated on the final AI message after a successful booking */
  confirmation?: BookingConfirmation;
}

export interface BookingState {
  phase: BookingPhase;
  availableSlots: TimeSlot[];
  selectedSlot?: TimeSlot;
  confirmation?: BookingConfirmation;
}

/**
 * The minimal frontend state for the AI-driven chat widget.
 * No scripted steps, no conversation data — the backend owns all of that.
 */
export interface ChatState {
  /** Messages to display in the chat window */
  messages: ChatMessage[];
  /** Backend-assigned conversation session ID */
  conversationId: string | null;
  /** Whether the AI is generating a reply */
  isTyping: boolean;
  /** Last known stage returned by the orchestrator */
  stage: ConversationStage;
  /** Booking sub-flow state (client-side only, after bookingTriggered) */
  bookingState: BookingState;
  /** Non-null while a network request is in flight */
  loading: boolean;
  /** Last error message, if any */
  error: string | null;
}

// ─── Legacy aliases kept for backwards-compat with non-chat code ──────
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

// ─── Business Settings Model (Sprint 4) ─────────────────────────────

/** Single day schedule entry */
export interface DaySchedule {
  isOpen: boolean;
  openTime: string;   // "08:00"
  closeTime: string;  // "18:00"
}

/** Full week of business hours, keyed by day name */
export interface BusinessHours {
  monday:    DaySchedule;
  tuesday:   DaySchedule;
  wednesday: DaySchedule;
  thursday:  DaySchedule;
  friday:    DaySchedule;
  saturday:  DaySchedule;
  sunday:    DaySchedule;
  emergencyAfterHours: boolean;
  vacationMode: boolean;
}

/** One configured service offering */
export interface ServiceItem {
  id: string;
  name: string;
  description: string;
  estimatedDuration: number; // minutes
  emergencyAvailable: boolean;
  active: boolean;
}

/** One team member */
export interface TeamMember {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  status: 'Active' | 'Inactive';
}

/** One FAQ entry for the AI receptionist */
export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

/** AI receptionist configuration */
export interface AIReceptionistConfig {
  welcomeMessage: string;
  tone: 'Friendly' | 'Professional' | 'Casual';
  collectEmail: boolean;
  collectAddress: boolean;
  askPreferredTechnician: boolean;
  enableEmergencyWorkflow: boolean;
  faq: FaqItem[];
}

/** Notification preferences */
export interface NotificationPreferences {
  smsAlerts: boolean;
  emailDigest: boolean;
  replacementAlerts: boolean;
  webhookUrl: string;
  webhookToken: string;
}

/** Full business settings model */
export interface BusinessSettings {
  // Profile
  companyName: string;
  logoUrl: string;        // placeholder — URL or empty string
  ownerName: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  timezone: string;
  description: string;
  industry: string;

  // Hours
  businessHours: BusinessHours;

  // Service area — set of active ZIP codes
  serviceAreaZips: string[];
  serviceAreaEnabled: boolean;

  // Service catalogue
  services: ServiceItem[];

  // AI config
  aiConfig: AIReceptionistConfig;

  // Team
  team: TeamMember[];

  // Notifications
  notifications: NotificationPreferences;
}

/**
 * BusinessProfile is the strongly-typed slice of BusinessSettings
 * that belongs to the Business Profile page.
 * It maps 1-to-1 with the profile fields on BusinessSettings so
 * businessProfileService can save/load it independently.
 */
export interface BusinessProfile {
  companyName: string;
  logoUrl: string;        // placeholder — URL or empty string
  ownerName: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  timezone: string;
  description: string;
  industry: string;
}
