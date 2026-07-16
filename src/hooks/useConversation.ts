/**
 * useConversation.ts  (AI-driven, backend-authoritative)
 *
 * The frontend is a thin presentation layer. All conversational logic —
 * intent detection, qualification, stage transitions, prompt generation —
 * lives in the backend orchestrator (runOrchestrator via widgetChat).
 *
 * Frontend responsibilities:
 *   - Render messages and typing indicator
 *   - Maintain local UI state (messages, conversationId, isTyping, bookingState, error)
 *   - Send every user message to POST /api/v1/widget/:token/chat
 *   - When bookingTriggered === true, drive the slot-picker → confirm → book sub-flow
 *   - Call POST /api/v1/widget/:token/book to persist the appointment
 *
 * Frontend is explicitly NOT responsible for:
 *   - Deciding what the AI should say next
 *   - Generating any AI prompts or responses
 *   - Tracking qualification steps or stages
 *   - Any scripted conversation logic
 */

import { useState, useCallback, useRef } from 'react';
import {
  ChatState,
  ChatMessage,
  TimeSlot,
  BookingConfirmation,
  ConversationStage,
  BookingPhase,
} from '../types';
import { widgetApiClient } from '../services/api/widgetApiClient';
import { calendarService } from '../services/calendar/calendarService';
import { notificationService } from '../services/notifications/notificationService';

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPING_DELAY_MS = 600;

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

const INITIAL_STATE: ChatState = {
  messages: [],
  conversationId: null,
  isTyping: true,   // show typing while we fetch the greeting
  stage: 'greeting',
  bookingState: { phase: 'idle', availableSlots: [] },
  loading: false,
  error: null,
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useConversation() {
  const [state, setState] = useState<ChatState>(INITIAL_STATE);

  /**
   * Ref that tracks whether we have already dispatched the greeting message.
   * Using a ref (not state) avoids triggering re-renders and prevents the
   * greeting from firing twice in React Strict Mode.
   */
  const greetingFiredRef = useRef(false);

  // ── Greeting initialisation ──────────────────────────────────────────────
  /**
   * Called once when the chat window first opens.
   * Sends a silent "hello" to the backend to get the AI's opening message,
   * and receives back a conversationId for the rest of the session.
   */
  const initConversation = useCallback(async () => {
    if (greetingFiredRef.current) return;
    greetingFiredRef.current = true;

    // Derive a stable conversationId for this widget session.
    const conversationId = makeId();

    setState(s => ({ ...s, conversationId, isTyping: true }));

    await delay(TYPING_DELAY_MS);

    try {
      const response = await widgetApiClient.chat({
        message: '__init__',
        conversationId,
        currentPage: typeof window !== 'undefined' ? window.location.pathname : undefined,
      });

      setState(s => ({
        ...s,
        isTyping: false,
        stage: response.stage as ConversationStage,
        messages: [makeAiMessage(response.reply)],
      }));
    } catch {
      // Fallback greeting if the backend is unreachable
      setState(s => ({
        ...s,
        isTyping: false,
        messages: [makeAiMessage("Hi! How can I help you today? I'm here to answer your questions and schedule service.")],
      }));
    }
  }, []);

  // ── Send message ─────────────────────────────────────────────────────────
  /**
   * The single entry point for every user input.
   *
   * - During the normal AI conversation, each message is forwarded to the
   *   backend orchestrator which owns all conversational logic.
   * - When the backend signals bookingTriggered, the frontend transitions
   *   into the booking sub-flow (slot picker → confirm → POST /widget/book).
   * - Slot selection and booking confirmation are handled client-side because
   *   they are pure UI interactions; the final booking is still persisted
   *   server-side via POST /widget/book.
   */
  const sendMessage = useCallback(async (text: string) => {
    const { isTyping, loading, stage, bookingState, conversationId } = state;

    if (isTyping || loading || stage === 'completed') return;
    if (!text.trim()) return;

    const userMsg = makeUserMessage(text);

    // ── Booking sub-flow ─────────────────────────────────────────────────
    if (bookingState.phase === 'selectSlot') {
      await handleSlotSelection(text, userMsg);
      return;
    }

    if (bookingState.phase === 'confirmSlot') {
      await handleSlotConfirmation(text, userMsg);
      return;
    }

    // ── Normal AI conversation ────────────────────────────────────────────
    const cid = conversationId ?? makeId();

    setState(s => ({
      ...s,
      conversationId: cid,
      messages: [...s.messages, userMsg],
      isTyping: true,
      error: null,
    }));

    await delay(TYPING_DELAY_MS);

    try {
      const response = await widgetApiClient.chat({
        message: text.trim(),
        conversationId: cid,
        currentPage: typeof window !== 'undefined' ? window.location.pathname : undefined,
      });

      const nextStage = response.stage as ConversationStage;

      // Check whether to trigger booking flow
      if (response.bookingTriggered) {
        // Add the AI reply first, then start loading slots
        setState(s => ({
          ...s,
          isTyping: false,
          stage: nextStage,
          messages: [...s.messages, makeAiMessage(response.reply)],
          bookingState: { ...s.bookingState, phase: 'loadingSlots' },
        }));

        await initiateBookingFlow();
        return;
      }

      setState(s => ({
        ...s,
        isTyping: false,
        stage: nextStage,
        messages: [...s.messages, makeAiMessage(response.reply)],
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setState(s => ({
        ...s,
        isTyping: false,
        error: message,
        messages: [
          ...s.messages,
          makeAiMessage("I'm having trouble connecting right now. Please try again in a moment."),
        ],
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // ── Booking sub-flow helpers ──────────────────────────────────────────────

  /**
   * Fetch available time slots from the calendar service and present them
   * in the chat via the SlotPicker component.
   */
  async function initiateBookingFlow() {
    try {
      const slots = await calendarService.getAvailableSlots(undefined, 60);

      if (slots.length === 0) {
        setState(s => ({
          ...s,
          bookingState: { phase: 'idle', availableSlots: [] },
          messages: [
            ...s.messages,
            makeAiMessage(
              "I'm sorry — we don't have any open slots right now. Our team will reach out to you directly to arrange a time."
            ),
          ],
          stage: 'completed',
        }));
        return;
      }

      const slotIntroMsg = makeAiMessage(
        "Here are our next available times. Please select one:",
        { slots }
      );

      setState(s => ({
        ...s,
        bookingState: { phase: 'selectSlot', availableSlots: slots },
        messages: [...s.messages, slotIntroMsg],
      }));
    } catch {
      setState(s => ({
        ...s,
        bookingState: { phase: 'idle', availableSlots: [] },
        messages: [
          ...s.messages,
          makeAiMessage(
            "I wasn't able to load available times right now. Our team will contact you shortly to schedule."
          ),
        ],
        stage: 'completed',
      }));
    }
  }

  /**
   * Handle a slot selection.
   * The user either clicked a SlotPicker button (which calls onSend(String(index)))
   * or typed a number.
   */
  async function handleSlotSelection(text: string, userMsg: ChatMessage) {
    const slots = state.bookingState.availableSlots;
    const idx = parseInt(text.trim(), 10) - 1;

    if (isNaN(idx) || idx < 0 || idx >= slots.length) {
      setState(s => ({
        ...s,
        messages: [
          ...s.messages,
          userMsg,
          makeAiMessage(`Please choose a number between 1 and ${slots.length}.`),
        ],
      }));
      return;
    }

    const chosen = slots[idx];

    setState(s => ({
      ...s,
      messages: [...s.messages, userMsg],
      isTyping: true,
      bookingState: { ...s.bookingState, phase: 'confirmSlot', selectedSlot: chosen },
    }));

    await delay(TYPING_DELAY_MS);

    const confirmPrompt =
      `I'll book you for **${chosen.displayDate} at ${chosen.displayTime}**.\n\n` +
      `Type **yes** to confirm or **no** to choose a different time.`;

    setState(s => ({
      ...s,
      isTyping: false,
      messages: [...s.messages, makeAiMessage(confirmPrompt)],
    }));
  }

  /**
   * Handle the yes/no confirmation after a slot has been chosen.
   */
  async function handleSlotConfirmation(text: string, userMsg: ChatMessage) {
    const lower = text.trim().toLowerCase();
    const { selectedSlot, availableSlots } = state.bookingState;

    // ── User wants a different time ──────────────────────────────────────
    if (lower.startsWith('n') || lower.includes('no') || lower.includes('other')) {
      setState(s => ({
        ...s,
        messages: [...s.messages, userMsg],
        isTyping: true,
        bookingState: { ...s.bookingState, phase: 'selectSlot', selectedSlot: undefined },
      }));

      await delay(TYPING_DELAY_MS);

      setState(s => ({
        ...s,
        isTyping: false,
        messages: [
          ...s.messages,
          makeAiMessage("No problem! Here are the available times again:", { slots: availableSlots }),
        ],
      }));
      return;
    }

    // ── Not a clear yes or no ────────────────────────────────────────────
    if (!lower.startsWith('y') && !lower.includes('yes') && !lower.includes('confirm')) {
      setState(s => ({
        ...s,
        messages: [
          ...s.messages,
          userMsg,
          makeAiMessage('Please type **yes** to confirm or **no** to pick a different time.'),
        ],
      }));
      return;
    }

    // ── Confirmed — persist the booking ──────────────────────────────────
    if (!selectedSlot) return;

    setState(s => ({
      ...s,
      messages: [...s.messages, userMsg],
      isTyping: true,
      loading: true,
      bookingState: { ...s.bookingState, phase: 'booking' },
    }));

    await delay(TYPING_DELAY_MS);

    const confirmation = await persistBooking(state.conversationId, state.messages, selectedSlot);

    if (confirmation) {
      const doneMsg = makeAiMessage(
        `Your appointment is confirmed! 🎉\n\nConfirmation: **${confirmation.confirmationNumber}**\n${confirmation.displayDate} at ${confirmation.displayTime}\n\nWe look forward to seeing you!`,
        { confirmation }
      );

      notificationService.sendConfirmation(confirmation);

      setState(s => ({
        ...s,
        isTyping: false,
        loading: false,
        stage: 'completed',
        messages: [...s.messages, doneMsg],
        bookingState: { phase: 'booked', availableSlots: [], confirmation },
      }));
    } else {
      setState(s => ({
        ...s,
        isTyping: false,
        loading: false,
        stage: 'completed',
        messages: [
          ...s.messages,
          makeAiMessage(
            "Something went wrong while booking your appointment. Our team will reach out to you directly to confirm."
          ),
        ],
        bookingState: { phase: 'idle', availableSlots: [] },
      }));
    }
  }

  // ── Reset ────────────────────────────────────────────────────────────────
  const resetConversation = useCallback(() => {
    greetingFiredRef.current = false;
    setState({ ...INITIAL_STATE, isTyping: false, messages: [] });
    // Re-init greeting on next render via effect in ChatWidget
  }, []);

  return { state, sendMessage, initConversation, resetConversation };
}

// ─── Booking persistence ──────────────────────────────────────────────────────

/**
 * Calls POST /api/v1/widget/:token/book.
 * Serialises the current chat messages so the server can store them on the
 * conversation record. All business logic (lead creation, appointment creation,
 * automation) is handled server-side.
 */
async function persistBooking(
  conversationId: string | null,
  messages: ChatMessage[],
  slot: TimeSlot,
): Promise<BookingConfirmation | null> {
  try {
    const serialisedMessages = messages.map(m => ({
      id:        m.id,
      sender:    m.sender as 'ai' | 'user' | 'agent',
      text:      m.text,
      timestamp: m.timestamp.toISOString(),
    }));

    const booking = await widgetApiClient.book({
      // The backend will extract name/service/phone from the conversation
      // session it already has. We pass safe fallbacks here; the authoritative
      // data lives in the AIConversationSession on the server.
      customerName:  'Widget Customer',
      phone:         '0000000000',
      service:       'HVAC Service',
      emergency:     false,
      date:          slot.date,
      time:          slot.time,
      displayDate:   slot.displayDate,
      displayTime:   slot.displayTime,
      duration:      60,
      conversationId: conversationId ?? undefined,
      messages:      serialisedMessages,
    });

    return {
      appointmentId:     booking.appointmentId,
      confirmationNumber:booking.confirmationNumber,
      customerName:      booking.customerName,
      service:           booking.service,
      date:              booking.date,
      time:              booking.time,
      displayDate:       booking.displayDate,
      displayTime:       booking.displayTime,
      estimatedDuration: booking.estimatedDuration,
      address:           booking.address,
    };
  } catch (err) {
    console.error('[useConversation] persistBooking failed:', err);
    return null;
  }
}
