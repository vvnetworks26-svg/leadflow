/**
 * businessSettings.ts
 *
 * Single source of truth for all business configuration.
 * All persistence is delegated to businessSettingsRepository.
 * No direct localStorage access in this file.
 */

import {
  BusinessSettings,
  BusinessHours,
  ServiceItem,
  TeamMember,
  AIReceptionistConfig,
  NotificationPreferences
} from '../../types';
import { businessSettingsRepository } from '../../repositories/LocalBusinessSettingsRepository';

// ─── Default seed data ────────────────────────────────────────────────────────

const DEFAULT_HOURS: BusinessHours = {
  monday:    { isOpen: true,  openTime: '08:00', closeTime: '18:00' },
  tuesday:   { isOpen: true,  openTime: '08:00', closeTime: '18:00' },
  wednesday: { isOpen: true,  openTime: '08:00', closeTime: '18:00' },
  thursday:  { isOpen: true,  openTime: '08:00', closeTime: '18:00' },
  friday:    { isOpen: true,  openTime: '08:00', closeTime: '18:00' },
  saturday:  { isOpen: true,  openTime: '09:00', closeTime: '14:00' },
  sunday:    { isOpen: false, openTime: '09:00', closeTime: '13:00' },
  emergencyAfterHours: true,
  vacationMode: false
};

const DEFAULT_SERVICES: ServiceItem[] = [
  { id: 'svc_1', name: 'AC Repair',          description: 'Diagnose and repair air conditioning systems.',                    estimatedDuration: 90,  emergencyAvailable: true,  active: true },
  { id: 'svc_2', name: 'Heating Repair',      description: 'Diagnose and repair furnaces, heat pumps, and boilers.',           estimatedDuration: 90,  emergencyAvailable: true,  active: true },
  { id: 'svc_3', name: 'System Installation', description: 'Full HVAC system replacement and installation.',                   estimatedDuration: 240, emergencyAvailable: false, active: true },
  { id: 'svc_4', name: 'Maintenance Tune-Up', description: 'Seasonal 16-point HVAC maintenance and tune-up.',                  estimatedDuration: 60,  emergencyAvailable: false, active: true },
  { id: 'svc_5', name: 'Emergency Repair',    description: '24/7 emergency HVAC repair — no heat or AC, active leak, safety.', estimatedDuration: 90,  emergencyAvailable: true,  active: true }
];

const DEFAULT_TEAM: TeamMember[] = [
  { id: 'tm_1', name: 'Mike Reynolds',  role: 'Senior Technician', phone: '(555) 901-2345', email: 'mike@miller-hvac.com',  status: 'Active'   },
  { id: 'tm_2', name: 'Chris Miller',   role: 'HVAC Technician',   phone: '(555) 902-3456', email: 'chris@miller-hvac.com', status: 'Active'   },
  { id: 'tm_3', name: 'Dave Carter',    role: 'Project Manager',   phone: '(555) 903-4567', email: 'dave@miller-hvac.com',  status: 'Active'   },
  { id: 'tm_4', name: 'Sarah Thompson', role: 'Dispatcher',        phone: '(555) 904-5678', email: 'sarah@miller-hvac.com', status: 'Inactive' }
];

const DEFAULT_AI_CONFIG: AIReceptionistConfig = {
  welcomeMessage: "Hi there! 👋 I'm the LeadFlow HVAC assistant. I can help you get a quote or schedule service. What's your name?",
  tone: 'Friendly',
  collectEmail: true,
  collectAddress: false,
  askPreferredTechnician: false,
  enableEmergencyWorkflow: true,
  faq: [
    { id: 'faq_1', question: 'What areas do you serve?',            answer: 'We serve the greater Atlanta metro area. Enter your ZIP code and I can confirm coverage.' },
    { id: 'faq_2', question: 'Do you offer emergency service?',     answer: 'Yes! We offer 24/7 emergency dispatch for no heat/AC, active leaks, and safety concerns.' },
    { id: 'faq_3', question: 'How much does a tune-up cost?',       answer: "Our seasonal maintenance tune-up starts at $89. We'll confirm pricing when we book your visit." },
    { id: 'faq_4', question: 'How long does an installation take?', answer: 'Most full system replacements take 4–8 hours. Our estimator will give you a firm timeline on-site.' }
  ]
};

const DEFAULT_NOTIFICATIONS: NotificationPreferences = {
  smsAlerts: true,
  emailDigest: true,
  replacementAlerts: true,
  webhookUrl: 'https://api.servicetitan.com/v2/webhooks/leadflow',
  webhookToken: 'st_tkn_8172hsa89as98sa'
};

export const DEFAULT_BUSINESS_SETTINGS: BusinessSettings = {
  companyName: 'Miller Climate Control LLC',
  logoUrl: '',
  ownerName: 'John Miller',
  email: 'john.miller@airtemp-hvac.com',
  phone: '(555) 302-1829',
  website: 'https://miller-hvac.com',
  address: '1428 Commerce Drive',
  city: 'Atlanta',
  state: 'GA',
  zipCode: '30308',
  timezone: 'EST',
  description: "Atlanta's trusted HVAC specialists — repair, installation, and maintenance for residential and light commercial systems.",
  industry: 'HVAC',
  businessHours: DEFAULT_HOURS,
  serviceAreaZips: [
    '30301','30302','30303','30304','30305','30306','30307','30308','30309',
    '30310','30311','30312','30313','30314','30315','30316','30317','30318',
    '30319','30320','30321','30322','30324','30325','30326','30327','30328',
    '30329','30330','30331','30332','30333','30334','30336','30337','30338',
    '30339','30340','30341','30342','30343','30344','30345','30346','30349',
    '30350','30354','30363'
  ],
  serviceAreaEnabled: true,
  services: DEFAULT_SERVICES,
  aiConfig: DEFAULT_AI_CONFIG,
  team: DEFAULT_TEAM,
  notifications: DEFAULT_NOTIFICATIONS
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

function load(): BusinessSettings {
  const stored = businessSettingsRepository.load();
  if (!stored) {
    businessSettingsRepository.save(DEFAULT_BUSINESS_SETTINGS);
    return DEFAULT_BUSINESS_SETTINGS;
  }
  return deepMerge(DEFAULT_BUSINESS_SETTINGS, stored);
}

/** Recursively merge `updates` onto `base`, returning a new object. */
function deepMerge<T extends object>(base: T, updates: Partial<T>): T {
  const result = { ...base };
  for (const key of Object.keys(updates) as (keyof T)[]) {
    const u = updates[key];
    const b = base[key];
    if (u !== undefined && u !== null) {
      if (typeof u === 'object' && !Array.isArray(u) && typeof b === 'object' && b !== null) {
        result[key] = deepMerge(b as object, u as object) as T[keyof T];
      } else {
        result[key] = u as T[keyof T];
      }
    }
  }
  return result;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const businessSettings = {
  get(): BusinessSettings {
    return load();
  },

  save(settings: BusinessSettings): void {
    businessSettingsRepository.save(settings);
  },

  update(patch: Partial<BusinessSettings>): BusinessSettings {
    const current = load();
    const updated = { ...current, ...patch };
    businessSettingsRepository.save(updated);
    return updated;
  },

  updateHours(hours: BusinessHours): BusinessSettings {
    return businessSettings.update({ businessHours: hours });
  },

  updateServiceArea(zips: string[], enabled?: boolean): BusinessSettings {
    return businessSettings.update({
      serviceAreaZips: zips,
      ...(enabled !== undefined ? { serviceAreaEnabled: enabled } : {})
    });
  },

  updateServices(services: ServiceItem[]): BusinessSettings {
    return businessSettings.update({ services });
  },

  updateAIConfig(config: AIReceptionistConfig): BusinessSettings {
    return businessSettings.update({ aiConfig: config });
  },

  updateTeam(team: TeamMember[]): BusinessSettings {
    return businessSettings.update({ team });
  },

  updateNotifications(prefs: NotificationPreferences): BusinessSettings {
    return businessSettings.update({ notifications: prefs });
  },

  reset(): BusinessSettings {
    businessSettingsRepository.save(DEFAULT_BUSINESS_SETTINGS);
    return DEFAULT_BUSINESS_SETTINGS;
  }
};
