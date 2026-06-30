import { ConversationData } from '../../types';
import { businessSettings } from '../business/businessSettings';

/**
 * Pure mock AI — returns canned HVAC responses for each conversation step.
 * Reads welcome message, tone, and service list from businessSettings.
 * No network calls. Swap the bodies for real LLM calls in a future sprint.
 */
export const chatApi = {
  /** Get the AI greeting from business configuration. */
  getGreeting(): string {
    return businessSettings.get().aiConfig.welcomeMessage;
  },

  getPromptForStep(step: string, data: Partial<ConversationData>): string {
    const settings = businessSettings.get();
    const firstName = data.name ? data.name.split(' ')[0] : 'there';
    const tone = settings.aiConfig.tone;
    const serviceNames = settings.services
      .filter(s => s.active)
      .map(s => s.name)
      .join(', ');

    switch (step) {
      case 'service':
        return tone === 'Professional'
          ? `Thank you, ${firstName}. What service do you require? We offer: ${serviceNames}.`
          : `Nice to meet you, ${firstName}! What HVAC service do you need? We offer: ${serviceNames}.`;

      case 'emergency':
        return `Got it — ${data.service}. Is this an emergency situation (no heat/AC, safety concern, or active leak)?`;

      case 'zipCode':
        return `Understood. What's your ZIP code? We want to confirm you're within our service area.`;

      case 'phone':
        return `We cover that area! What's the best phone number to reach you?`;

      case 'email':
        return settings.aiConfig.collectEmail
          ? `Perfect. What's your email address? (Type "skip" to continue without one.)`
          : null as unknown as string; // step skipped by engine

      case 'preferredDay':
        return `Almost done! What's your preferred day for a technician visit? For example: today, tomorrow, this weekend, or a specific day.`;

      case 'completed':
        return buildCompletionMessage(data as ConversationData);

      default:
        return 'Thanks for the info. Our team will be in touch shortly!';
    }
  },

  validateResponse(step: string, value: string): string | null {
    const trimmed = value.trim();
    switch (step) {
      case 'name':
        if (trimmed.length < 2) return 'Please enter your full name.';
        break;
      case 'phone': {
        const digits = trimmed.replace(/\D/g, '');
        if (digits.length < 10) return 'Please enter a valid 10-digit phone number.';
        break;
      }
      case 'zipCode':
        if (!/^\d{5}$/.test(trimmed)) return 'Please enter a valid 5-digit ZIP code.';
        break;
    }
    return null;
  }
};

// ─── Helpers ────────────────────────────────────────────────────────

function buildCompletionMessage(data: ConversationData): string {
  const firstName = data.name ? data.name.split(' ')[0] : 'there';
  const settings = businessSettings.get();
  const companyName = settings.companyName;

  if (data.emergency) {
    return `Thanks, ${firstName}! Your emergency request has been received. A ${companyName} dispatcher will call you at ${data.phone} within 30 minutes. Help is on the way! 🔧`;
  }
  return `Thanks, ${firstName}! Your request is confirmed. ${companyName} will reach out at ${data.phone} to finalize your appointment${data.preferredDay ? ` for ${data.preferredDay}` : ''}. Looking forward to helping you! 😊`;
}

/** Format a phone number typed by the user into (XXX) XXX-XXXX */
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw;
}
