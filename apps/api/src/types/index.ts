/**
 * types/index.ts
 *
 * Shared domain types for the API layer.
 * These mirror the frontend interfaces in src/types/index.ts exactly
 * so domain objects can be used without conversion on either side.
 */

// ─── Lead ─────────────────────────────────────────────────────────────────────
export type LeadStatus =
  | 'New' | 'Contacted' | 'Qualified' | 'Unqualified'
  | 'Proposal' | 'Closed Won' | 'Closed Lost';

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

// ─── Appointment ─────────────────────────────────────────────────────────────
export type AppointmentStatus =
  | 'Scheduled' | 'Completed' | 'Canceled' | 'No Show'
  | 'Pending' | 'Confirmed' | 'Rescheduled';

export type AppointmentType =
  | 'Maintenance' | 'Repair Consultation'
  | 'System Replacement Quote' | 'Emergency Service';

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
  date: string;       // YYYY-MM-DD
  time: string;       // HH:MM
  duration: number;   // minutes
  type: AppointmentType;
  status: AppointmentStatus;
  notes: string;
  assignedTechnician?: string;
  value?: number;
  createdAt?: string;
  updatedAt?: string;
}

// ─── Conversation ─────────────────────────────────────────────────────────────
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

// ─── Business Settings ────────────────────────────────────────────────────────
export interface DaySchedule {
  isOpen: boolean;
  openTime: string;   // "08:00"
  closeTime: string;  // "18:00"
}

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

export interface ServiceItem {
  id: string;
  name: string;
  description: string;
  estimatedDuration: number;
  emergencyAvailable: boolean;
  active: boolean;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  status: 'Active' | 'Inactive';
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface AIReceptionistConfig {
  welcomeMessage: string;
  tone: 'Friendly' | 'Professional' | 'Casual';
  collectEmail: boolean;
  collectAddress: boolean;
  askPreferredTechnician: boolean;
  enableEmergencyWorkflow: boolean;
  faq: FaqItem[];
}

export interface NotificationPreferences {
  smsAlerts: boolean;
  emailDigest: boolean;
  replacementAlerts: boolean;
  webhookUrl: string;
  webhookToken: string;
}

export interface BusinessSettings {
  companyName: string;
  logoUrl: string;
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
  businessHours: BusinessHours;
  serviceAreaZips: string[];
  serviceAreaEnabled: boolean;
  services: ServiceItem[];
  aiConfig: AIReceptionistConfig;
  team: TeamMember[];
  notifications: NotificationPreferences;
}

// ─── Notification ─────────────────────────────────────────────────────────────
export type NotificationType = 'success' | 'info' | 'warning' | 'error';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
}
