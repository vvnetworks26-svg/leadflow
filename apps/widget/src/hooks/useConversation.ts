/**
 * useConversation.ts  (AI-driven, backend-authoritative)
 *
 * The frontend is a thin presentation layer. All conversational logic —
 * intent detection, qualification, stage transitions, prompt generation —
 * lives in the backend orchestrator (runOrchestrator via widgetChat).
 *
 * Frontend responsibilities:
 *   - Render messages and typing indicator
 *   - Maintain local UI state (messages, widgetSessionId, isTyping, bookingState, error)
 *   - Create a session via POST /api/v1/widget/:token/session once, up front
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
  extras?: { slots?: TimeSlot[]; needsName?: boolean; confirmation?: BookingConfirmation }
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
 * Races a promise against a timer. Does NOT cancel the underlying request
 * (axios has no signal wired in here) — if the original promise resolves
 * late, its result is simply ignored. That's the correct tradeoff for a
 * stalled connection: waiting indefinitely is worse than occasionally
 * having two requests briefly in flight.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('TIMEOUT')), ms);
    promise.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
}

// Session creation is normally sub-second (confirmed against live logs) —
// a few seconds is generous, not a real request budget. Investigated stall:
// the OPTIONS preflight for POST /:token/session succeeds instantly, but the
// POST itself sometimes never reaches the server at all (confirmed via
// server request logs — no "request started" entry appears for it), most
// consistent with a stale/dropped keep-alive connection being reused after
// an idle gap. A retry issues a fresh request rather than continuing to
// wait on the same one.
const SESSION_CREATE_TIMEOUT_MS     = 6_000;
const SESSION_CREATE_RETRY_DELAY_MS = 1_000;

const INITIAL_STATE: ChatState = {
  messages: [],
  widgetSessionId: null,
  isTyping: true,   // show typing while we fetch the greeting
  stage: 'greeting',
  visitorName: null,
  bookingState: { phase: 'idle', availableSlots: [] },
  loading: false,
  error: null,
  reconnecting: false,
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
   * Creates a real server-side session (POST /:token/session) — the
   * widgetSessionId it returns is required on every subsequent /chat and
   * /book call. Never generate this ID client-side; the server owns it.
   * Then sends a silent "hello" to get the AI's opening message.
   */
  const initConversation = useCallback(async () => {
    if (greetingFiredRef.current) return;
    greetingFiredRef.current = true;

    setState(s => ({ ...s, isTyping: true }));

    await delay(TYPING_DELAY_MS);

    // ── Session creation, with one automatic retry ──────────────────────────
    // First attempt uses a short budget rather than the client's default
    // 10s — a hung/stalled connection should surface (and recover) quickly,
    // not silently eat most of a visitor's patience before anything happens.
    let session: { widgetSessionId: string } | null = null;

    try {
      session = await withTimeout(widgetApiClient.createSession(), SESSION_CREATE_TIMEOUT_MS);
    } catch {
      // Visible feedback instead of silence — see SESSION_CREATE_TIMEOUT_MS's
      // comment above for what this is recovering from.
      setState(s => ({ ...s, reconnecting: true }));
      await delay(SESSION_CREATE_RETRY_DELAY_MS);

      try {
        session = await withTimeout(widgetApiClient.createSession(), SESSION_CREATE_TIMEOUT_MS);
      } catch {
        session = null;
      }

      setState(s => ({ ...s, reconnecting: false }));
    }

    if (!session) {
      // Both attempts failed — same honest fallback as before, no
      // widgetSessionId means no real conversation is possible yet.
      setState(s => ({
        ...s,
        isTyping: false,
        messages: [makeAiMessage("Hi! How can I help you today? I'm here to answer your questions and schedule service.")],
      }));
      return;
    }

    try {
      const { widgetSessionId } = session;
      setState(s => ({ ...s, widgetSessionId }));

      const response = await widgetApiClient.chat({
        message: '__init__',
        widgetSessionId,
        currentPage: typeof window !== 'undefined' ? window.location.pathname : undefined,
      });

      setState(s => ({
        ...s,
        isTyping: false,
        stage: response.stage as ConversationStage,
        visitorName: response.visitorName ?? s.visitorName,
        messages: [makeAiMessage(response.reply)],
      }));
    } catch {
      // Fallback greeting if the init chat call fails after a real session
      // was created.
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
    const { isTyping, loading, stage, bookingState, widgetSessionId } = state;

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

    if (bookingState.phase === 'collectName') {
      await handleNameCollection(text, userMsg);
      return;
    }

    // ── Normal AI conversation ────────────────────────────────────────────
    // widgetSessionId must already exist by the time a user can type —
    // initConversation() creates it before the chat window is interactive.
    // No client-side fallback ID is generated here; if it's somehow
    // missing, surface the error below rather than silently minting one
    // the server has never seen.
    if (!widgetSessionId) {
      setState(s => ({ ...s, error: 'Session not ready yet — please try again in a moment.' }));
      return;
    }

    setState(s => ({
      ...s,
      messages: [...s.messages, userMsg],
      isTyping: true,
      error: null,
    }));

    await delay(TYPING_DELAY_MS);

    try {
      const response = await widgetApiClient.chat({
        message: text.trim(),
        widgetSessionId,
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
          visitorName: response.visitorName ?? s.visitorName,
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
        visitorName: response.visitorName ?? s.visitorName,
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
    const visitorName = state.visitorName;

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

    setState(s => ({ ...s, messages: [...s.messages, userMsg] }));

    if (!visitorName) {
      // The AI never captured a name for this session. Happens on the
      // emergency-triage paths (hvac.emergency, plumbing.emergency), which
      // only require a phone number before booking becomes available — see
      // conversation-engine/blueprints/default-blueprints.ts. Ask for it
      // via the collectName sub-flow instead of persisting a placeholder;
      // the backend rejects a booking with no name at all (MISSING_CONTACT_INFO).
      setState(s => ({
        ...s,
        isTyping: true,
        bookingState: { ...s.bookingState, phase: 'collectName' },
      }));

      await delay(TYPING_DELAY_MS);

      setState(s => ({
        ...s,
        isTyping: false,
        messages: [...s.messages, makeAiMessage("Before I confirm — what's your name?", { needsName: true })],
      }));
      return;
    }

    await finalizeBooking(selectedSlot, visitorName);
  }

  /**
   * Handle the visitor submitting their name via the collectName sub-flow —
   * only reached when handleSlotConfirmation found no name already known
   * (see above). The typed text (or the inline ContactForm's submission,
   * which also routes through onSend/sendMessage) is taken directly as the
   * name; it is not sent to the AI as a chat turn.
   */
  async function handleNameCollection(text: string, userMsg: ChatMessage) {
    const name = text.trim();
    const { selectedSlot } = state.bookingState;

    if (!name) {
      setState(s => ({
        ...s,
        messages: [...s.messages, userMsg, makeAiMessage("I'll need your name to confirm the booking.", { needsName: true })],
      }));
      return;
    }

    if (!selectedSlot) {
      // Unreachable in practice — collectName is only entered from a state
      // that already has a selectedSlot (see handleSlotConfirmation) — but
      // don't persist a booking with no slot if it somehow happens.
      setState(s => ({ ...s, bookingState: { phase: 'idle', availableSlots: [] } }));
      return;
    }

    setState(s => ({ ...s, messages: [...s.messages, userMsg], visitorName: name }));
    await finalizeBooking(selectedSlot, name);
  }

  /**
   * Shared tail of the booking sub-flow — persists the booking and renders
   * the resulting success/failure message. Used both when the AI already
   * had the visitor's name and after the collectName fallback supplies it.
   */
  async function finalizeBooking(slot: TimeSlot, customerName: string) {
    setState(s => ({
      ...s,
      isTyping: true,
      loading: true,
      bookingState: { ...s.bookingState, phase: 'booking' },
    }));

    await delay(TYPING_DELAY_MS);

    const confirmation = await persistBooking(state.widgetSessionId, state.messages, slot, customerName);

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
        // 'failed', not 'idle' — ChatWindow's generic "All set!" banner fires
        // whenever stage === 'completed' unless bookingState.phase says
        // otherwise. 'idle' looked like "no booking was ever attempted" to
        // that check, so a rejected/errored booking silently rendered the
        // happy-path banner right below this honest failure message.
        bookingState: { phase: 'failed', availableSlots: [] },
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
 *
 * widgetSessionId is required by the backend (see WidgetBookSchema) — the
 * booking is rejected if it's missing or doesn't reference a real session.
 *
 * customerName is sent only as a fallback for the case where the AI never
 * captured one (the collectName sub-flow — see handleSlotConfirmation /
 * handleNameCollection above). The backend's session memory is the
 * authoritative source and is preferred there whenever it has a name.
 * Phone is never sent from here at all — the backend sources it from
 * session memory exclusively (guaranteed present by the stage gate before
 * booking is ever reachable). See WidgetBookSchema / widgetBook() in
 * widgetController.ts.
 */
async function persistBooking(
  widgetSessionId: string | null,
  messages: ChatMessage[],
  slot: TimeSlot,
  customerName: string,
): Promise<BookingConfirmation | null> {
  if (!widgetSessionId) {
    console.error('[useConversation] persistBooking called with no widgetSessionId');
    return null;
  }

  try {
    const serialisedMessages = messages.map(m => ({
      id:        m.id,
      sender:    m.sender as 'ai' | 'user' | 'agent',
      text:      m.text,
      timestamp: m.timestamp.toISOString(),
    }));

    const booking = await widgetApiClient.book({
      customerName,
      service:       'HVAC Service',
      emergency:     false,
      date:          slot.date,
      time:          slot.time,
      displayDate:   slot.displayDate,
      displayTime:   slot.displayTime,
      duration:      60,
      widgetSessionId,
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
