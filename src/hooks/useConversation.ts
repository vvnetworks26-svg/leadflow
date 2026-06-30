import { useState, useCallback } from 'react';
import {
  ConversationData,
  ConversationStep,
  ChatMessage,
  ChatState,
  TimeSlot,
  BookingConfirmation
} from '../types';
import { chatApi, formatPhone } from '../services/api/chat';
import { qualifyLead, estimateDealValue } from '../services/qualification';
import { conversationsApi } from '../services/api/conversations';
import { leadsApi } from '../services/api/leads';
import { calendarService } from '../services/calendar/calendarService';
import { notificationService } from '../services/notifications/notificationService';
import { businessSettings } from '../services/business/businessSettings';

const TYPING_DELAY_MS = 800;

function makeId(): string {
  return `chat_${Math.random().toString(36).substr(2, 9)}`;
}

function makeAiMessage(
  text: string,
  extras?: { slots?: TimeSlot[]; confirmation?: BookingConfirmation }
): ChatMessage {
  return { id: makeId(), sender: 'ai', text, timestamp: new Date(), ...extras };
}

function makeUserMessage(text: string): ChatMessage {
  return { id: makeId(), sender: 'user', text, timestamp: new Date() };
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Derive the ordered qualification steps at runtime from AI config.
 *
 * - 'emergency' step is included only when enableEmergencyWorkflow is true.
 * - 'email' step is included only when collectEmail is true.
 *
 * This means changing those toggles in Settings immediately changes the
 * flow for the next conversation without touching any other code.
 */
function buildQualificationSteps(): ConversationStep[] {
  const cfg = businessSettings.get().aiConfig;
  const steps: ConversationStep[] = ['greeting', 'name', 'service'];
  if (cfg.enableEmergencyWorkflow) steps.push('emergency');
  steps.push('zipCode', 'phone');
  if (cfg.collectEmail) steps.push('email');
  steps.push('preferredDay');
  return steps;
}

function nextQualStep(current: ConversationStep): ConversationStep {
  const steps = buildQualificationSteps();
  const idx = steps.indexOf(current);
  if (idx === -1 || idx === steps.length - 1) return 'selectSlot';
  return steps[idx + 1];
}

/**
 * useConversation
 *
 * Manages the full multi-step guided HVAC chat + booking flow:
 *   greeting → name → service → emergency → zipCode → phone → email → preferredDay
 *   → selectSlot (AI offers slots, user types a number)
 *   → confirmSlot (AI confirms choice, user types "yes")
 *   → booked (persisted, confirmation shown)
 *   → completed
 */
export function useConversation() {
  const [state, setState] = useState<ChatState>({
    step: 'greeting',
    messages: [makeAiMessage(chatApi.getGreeting())],
    data: {},
    isTyping: false
  });

  /**
   * sendMessage — the single entry point for every user input.
   * Handles both the text-based qualification steps and the
   * slot-selection / confirmation steps.
   */
  const sendMessage = useCallback(async (text: string) => {
    const current = state.step;
    if (state.isTyping || current === 'completed') return;

    const userMsg = makeUserMessage(text);

    // ── Slot selection step ─────────────────────────────────────────
    if (current === 'selectSlot') {
      const idx = parseInt(text.trim(), 10) - 1;
      const slots = state.data.availableSlots ?? [];

      if (isNaN(idx) || idx < 0 || idx >= slots.length) {
        setState(s => ({
          ...s,
          messages: [
            ...s.messages,
            userMsg,
            makeAiMessage(`Please reply with a number between 1 and ${slots.length}.`)
          ]
        }));
        return;
      }

      const chosen = slots[idx];
      setState(s => ({
        ...s,
        messages: [...s.messages, userMsg],
        data: { ...s.data, selectedSlot: chosen },
        step: 'confirmSlot',
        isTyping: true
      }));

      await delay(TYPING_DELAY_MS);

      const confirmText =
        `Great choice! I'll book you for **${chosen.displayDate} at ${chosen.displayTime}**.\n\n` +
        `Service: ${state.data.service}\nName: ${state.data.name}\nPhone: ${state.data.phone}\n\n` +
        `Type "yes" to confirm or "no" to see other times.`;

      setState(s => ({
        ...s,
        messages: [...s.messages, makeAiMessage(confirmText)],
        isTyping: false
      }));
      return;
    }

    // ── Confirm slot step ───────────────────────────────────────────
    if (current === 'confirmSlot') {
      const lower = text.trim().toLowerCase();

      if (lower.startsWith('n') || lower.includes('no') || lower.includes('other')) {
        // Go back to selectSlot and re-show slots
        setState(s => ({
          ...s,
          messages: [...s.messages, userMsg],
          step: 'selectSlot',
          isTyping: true
        }));
        await delay(TYPING_DELAY_MS);
        const slots = state.data.availableSlots ?? [];
        setState(s => ({
          ...s,
          messages: [...s.messages, makeAiMessage(buildSlotPrompt(slots), { slots })],
          isTyping: false
        }));
        return;
      }

      if (!lower.startsWith('y') && !lower.includes('yes') && !lower.includes('confirm')) {
        setState(s => ({
          ...s,
          messages: [
            ...s.messages,
            userMsg,
            makeAiMessage('Please type "yes" to confirm or "no" to pick a different time.')
          ]
        }));
        return;
      }

      // Confirmed — book it
      setState(s => ({
        ...s,
        messages: [...s.messages, userMsg],
        step: 'booked',
        isTyping: true
      }));

      await delay(TYPING_DELAY_MS * 1.5);

      // Persist everything and get confirmation
      const confirmation = await persistBooking(state, setState);

      if (confirmation) {
        const doneMsg = makeAiMessage(
          `Your appointment is confirmed! 🎉\n\nConfirmation # ${confirmation.confirmationNumber}\n${confirmation.displayDate} at ${confirmation.displayTime}\n\nWe look forward to seeing you!`,
          { confirmation }
        );
        setState(s => ({
          ...s,
          messages: [...s.messages, doneMsg],
          isTyping: false,
          step: 'completed'
        }));
      } else {
        setState(s => ({
          ...s,
          messages: [
            ...s.messages,
            makeAiMessage('Something went wrong booking your appointment. Our team will call you shortly!')
          ],
          isTyping: false,
          step: 'completed'
        }));
      }
      return;
    }

    // ── Standard qualification steps ────────────────────────────────
    const validationError = chatApi.validateResponse(current, text);
    if (validationError) {
      setState(s => ({
        ...s,
        messages: [...s.messages, userMsg, makeAiMessage(validationError)]
      }));
      return;
    }

    const newData = parseResponse(current, text, state.data);
    const nextStep = nextQualStep(current);

    setState(s => ({
      ...s,
      messages: [...s.messages, userMsg],
      data: newData,
      step: nextStep,
      isTyping: true
    }));

    await delay(TYPING_DELAY_MS);

    // After preferredDay → fetch slots
    if (nextStep === 'selectSlot') {
      const slots = await calendarService.getAvailableSlots(newData.preferredDay, 60);
      const updatedData = { ...newData, availableSlots: slots };

      if (slots.length === 0) {
        setState(s => ({
          ...s,
          data: updatedData,
          messages: [
            ...s.messages,
            makeAiMessage(
              "I'm sorry, we don't have openings matching your preference right now. " +
              "Our team will call you at " + newData.phone + " to arrange a time. Thank you!"
            )
          ],
          isTyping: false,
          step: 'completed'
        }));
        await persistLeadOnly(updatedData, [...state.messages, userMsg], setState);
        return;
      }

      setState(s => ({
        ...s,
        data: updatedData,
        messages: [
          ...s.messages,
          makeAiMessage(buildSlotPrompt(slots), { slots })
        ],
        isTyping: false
      }));
      return;
    }

    // Normal next prompt
    const aiText = chatApi.getPromptForStep(nextStep, newData);
    setState(s => ({
      ...s,
      messages: [...s.messages, makeAiMessage(aiText)],
      isTyping: false
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const resetConversation = useCallback(() => {
    setState({
      step: 'greeting',
      messages: [makeAiMessage(chatApi.getGreeting())],
      data: {},
      isTyping: false
    });
  }, []);

  return { state, sendMessage, resetConversation };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSlotPrompt(slots: TimeSlot[]): string {
  const lines = slots
    .map((s, i) => `${i + 1}. ${s.displayDate} at ${s.displayTime}`)
    .join('\n');
  return `Here are the next available times:\n\n${lines}\n\nReply with the number of your preferred slot.`;
}

function parseResponse(
  step: ConversationStep,
  text: string,
  existing: ConversationData
): ConversationData {
  const trimmed = text.trim();
  switch (step) {
    case 'name':      return { ...existing, name: trimmed };
    case 'service':   return { ...existing, service: trimmed };
    case 'emergency': {
      const lower = trimmed.toLowerCase();
      return { ...existing, emergency: lower.startsWith('y') || lower.includes('yes') || lower.includes('emergency') };
    }
    case 'zipCode':   return { ...existing, zipCode: trimmed };
    case 'phone':     return { ...existing, phone: formatPhone(trimmed) };
    case 'email': {
      const lower = trimmed.toLowerCase();
      return { ...existing, email: lower === 'skip' ? undefined : trimmed };
    }
    case 'preferredDay': return { ...existing, preferredDay: trimmed };
    default: return existing;
  }
}

/** Full persist: conversation + lead + appointment + link everything */
async function persistBooking(
  state: ChatState,
  setState: (fn: (s: ChatState) => ChatState) => void
): Promise<BookingConfirmation | null> {
  const { data } = state;
  const slot = data.selectedSlot;
  if (!slot) return null;

  try {
    const qualification = qualifyLead(data);
    const value = estimateDealValue(data.service ?? '', data.emergency ?? false);

    // 1. Persist conversation
    const convMessages = state.messages.map(m => ({
      id: m.id,
      sender: m.sender as 'ai' | 'user',
      text: m.text,
      timestamp: m.timestamp.toISOString()
    }));
    const conv = await conversationsApi.create({
      leadName: data.name ?? 'Unknown',
      leadPhone: data.phone ?? '',
      leadEmail: data.email,
      hvacNeed: data.service,
      status: 'completed',
      lastMessageAt: new Date().toISOString(),
      messages: convMessages
    });

    // 2. Create lead
    const lead = await leadsApi.create({
      name: data.name ?? 'Unknown',
      phone: data.phone ?? '',
      email: data.email ?? '',
      zipCode: data.zipCode,
      address: data.zipCode ? `ZIP: ${data.zipCode}` : 'Not provided',
      status: qualification.status,
      priority: qualification.priority,
      value,
      source: 'AI Chat',
      hvacNeed: data.service ?? 'General inquiry',
      emergency: data.emergency ?? false,
      conversationId: conv.id,
      qualificationReason: qualification.reason,
      preferredDay: data.preferredDay,
      notes: `Captured via AI chat. ${qualification.reason}`
    });

    // 3. Book appointment via calendar service
    const confirmation = await calendarService.bookAppointment({
      slot,
      customerName: data.name ?? 'Unknown',
      phone: data.phone ?? '',
      email: data.email,
      address: data.zipCode ? `ZIP: ${data.zipCode}` : 'Not provided',
      zipCode: data.zipCode,
      service: data.service ?? 'General HVAC Service',
      emergency: data.emergency ?? false,
      conversationId: conv.id,
      leadId: lead.id,
      notes: `Customer preferred day: ${data.preferredDay ?? 'flexible'}.`
    });

    // 4. Link everything
    await conversationsApi.linkLead(conv.id, lead.id);
    await leadsApi.update(lead.id, { appointmentId: confirmation.appointmentId });

    // 5. Fire notifications
    notificationService.sendConfirmation(confirmation);

    setState(s => ({
      ...s,
      conversationId: conv.id,
      leadId: lead.id,
      appointmentId: confirmation.appointmentId,
      data: { ...s.data, bookingConfirmation: confirmation }
    }));

    return confirmation;
  } catch (err) {
    console.error('[useConversation] Failed to persist booking:', err);
    return null;
  }
}

/** Fallback: only persist lead (no available slots) */
async function persistLeadOnly(
  data: ConversationData,
  messages: ChatMessage[],
  setState: (fn: (s: ChatState) => ChatState) => void
): Promise<void> {
  try {
    const qualification = qualifyLead(data);
    const value = estimateDealValue(data.service ?? '', data.emergency ?? false);

    const convMessages = messages.map(m => ({
      id: m.id,
      sender: m.sender as 'ai' | 'user',
      text: m.text,
      timestamp: m.timestamp.toISOString()
    }));

    const conv = await conversationsApi.create({
      leadName: data.name ?? 'Unknown',
      leadPhone: data.phone ?? '',
      leadEmail: data.email,
      hvacNeed: data.service,
      status: 'completed',
      lastMessageAt: new Date().toISOString(),
      messages: convMessages
    });

    const lead = await leadsApi.create({
      name: data.name ?? 'Unknown',
      phone: data.phone ?? '',
      email: data.email ?? '',
      zipCode: data.zipCode,
      address: data.zipCode ? `ZIP: ${data.zipCode}` : 'Not provided',
      status: qualification.status,
      priority: qualification.priority,
      value,
      source: 'AI Chat',
      hvacNeed: data.service ?? 'General inquiry',
      emergency: data.emergency ?? false,
      conversationId: conv.id,
      qualificationReason: qualification.reason,
      preferredDay: data.preferredDay,
      notes: `Captured via AI chat. No available slots — team to call. ${qualification.reason}`
    });

    await conversationsApi.linkLead(conv.id, lead.id);
    setState(s => ({ ...s, conversationId: conv.id, leadId: lead.id }));
  } catch (err) {
    console.error('[useConversation] persistLeadOnly failed:', err);
  }
}
