/**
 * ChatWidget.booking.test.tsx
 *
 * Regression test for two real bugs found and fixed in this change:
 *   1. The widget's actual booking form (SlotPicker → confirm) was still
 *      sending the old, now-unsupported `conversationId` field to
 *      POST /:token/book instead of the `widgetSessionId` the backend has
 *      required since Track 1.
 *   2. persistBooking() hardcoded 'Widget Customer' / '0000000000' as
 *      customerName/phone on every booking, regardless of what the AI had
 *      actually captured in the conversation. Covers both the common case
 *      (name already known — used directly, never asked twice) and the
 *      emergency-triage case (name genuinely never collected — the
 *      collectName inline form asks for it before booking).
 *
 * This renders the real component tree (ChatWidget → ChatWindow →
 * ChatInput/ChatBubble/SlotPicker/ContactForm) and drives it through actual
 * user interaction (click, type, click) — not just a hook-level or
 * API-contract check — so a regression in the prop-wiring between
 * components, not just the request payload, would also be caught.
 *
 * Only the network boundary (widgetApiClient, calendarService) is mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatWidget } from '../ChatWidget';

const FIND_TIMEOUT = { timeout: 3000 };

vi.mock('@leadflow/shared/widgetApiClient', () => {
  const createSession = vi.fn();
  const chat = vi.fn();
  const book = vi.fn();
  const getConfig = vi.fn();
  return {
    widgetApiClient: { createSession, chat, book, getConfig, getToken: () => 'test-token' },
  };
});

vi.mock('../../../services/calendar/calendarService', () => ({
  calendarService: {
    getAvailableSlots: vi.fn(),
  },
}));

import { widgetApiClient } from '@leadflow/shared/widgetApiClient';
import { calendarService } from '../../../services/calendar/calendarService';

const mockedClient = vi.mocked(widgetApiClient);
const mockedCalendar = vi.mocked(calendarService);

const TEST_SESSION_ID = 'test-widget-session-id-abc123';

describe('Widget booking form — sends widgetSessionId, not the old conversationId', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedClient.createSession.mockResolvedValue({
      widgetSessionId: TEST_SESSION_ID,
      schemaVersion: 1,
      stage: 'greeting',
      turnCount: 0,
    });

    // First call is the silent '__init__' greeting; second is the real
    // user message that triggers the booking sub-flow. visitorName is
    // already known by the second turn — a realistic conversation collects
    // it (visitorNameCollected) well before reaching booking; see
    // default-blueprints.ts. The no-name (collectName sub-flow) case is
    // covered separately below.
    mockedClient.chat
      .mockResolvedValueOnce({ reply: 'Hi! How can I help?', stage: 'greeting', bookingTriggered: false, visitorName: null })
      .mockResolvedValueOnce({ reply: "Let's get you booked!", stage: 'booking', bookingTriggered: true, visitorName: 'Jamie Rivera' });

    mockedCalendar.getAvailableSlots.mockResolvedValue([
      { date: '2026-09-05', time: '09:00', displayDate: 'Sep 5', displayTime: '9:00 AM', available: true },
    ]);

    mockedClient.book.mockResolvedValue({
      appointmentId: 'appt-1',
      confirmationNumber: 'LF-TEST1',
      conversationId: 'server-conv-id',
      leadId: 'lead-1',
      customerName: 'Jamie Rivera',
      service: 'HVAC Service',
      date: '2026-09-05',
      time: '09:00',
      displayDate: 'Sep 5',
      displayTime: '9:00 AM',
      estimatedDuration: 60,
      address: 'Not provided',
    });
  });

  it('threads the real server-issued widgetSessionId through session creation → chat → book', async () => {
    const user = userEvent.setup();
    render(<ChatWidget />);

    // Open the widget — triggers initConversation() → createSession() + init chat().
    await user.click(screen.getByRole('button', { name: /open chat assistant/i }));

    // Greeting arrives once createSession() + the init chat() call resolve.
    await screen.findByText('Hi! How can I help?', {}, FIND_TIMEOUT);

    // createSession() must be called exactly once, with no arguments — no
    // client-side ID generation feeding it.
    expect(mockedClient.createSession).toHaveBeenCalledTimes(1);

    // The init chat() call must use the server-issued widgetSessionId, not
    // a client-generated conversationId.
    expect(mockedClient.chat).toHaveBeenNthCalledWith(1, expect.objectContaining({
      message: '__init__',
      widgetSessionId: TEST_SESSION_ID,
    }));
    expect(mockedClient.chat.mock.calls[0][0]).not.toHaveProperty('conversationId');

    // Send a real message — triggers bookingTriggered → SlotPicker.
    const textarea = screen.getByLabelText('Chat message');
    await user.type(textarea, 'My AC is broken, I want to book a repair');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    expect(await screen.findByRole('list', { name: /available appointment slots/i }, FIND_TIMEOUT)).toBeInTheDocument();
    expect(mockedClient.chat).toHaveBeenNthCalledWith(2, expect.objectContaining({
      widgetSessionId: TEST_SESSION_ID,
    }));

    // Click the (only) available slot.
    const slotList = screen.getByRole('list', { name: /available appointment slots/i });
    await user.click(within(slotList).getByRole('listitem'));

    // Confirm prompt appears; type "yes". ("yes"/"no" render as bold <b>
    // spans — matching a plain-text segment instead of the raw markdown.)
    await screen.findByText(/to confirm or/i, {}, FIND_TIMEOUT);
    await user.type(screen.getByLabelText('Chat message'), 'yes');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    // Booking confirmation arrives.
    await screen.findByText(/appointment is confirmed/i, {}, FIND_TIMEOUT);

    // ── The actual regression check ──────────────────────────────────────
    expect(mockedClient.book).toHaveBeenCalledTimes(1);
    const bookCallArgs = mockedClient.book.mock.calls[0][0];
    expect(bookCallArgs.widgetSessionId).toBe(TEST_SESSION_ID);
    expect(bookCallArgs).not.toHaveProperty('conversationId');

    // ── Placeholder-data regression check ──────────────────────────────────
    // customerName must be the real name the AI already captured earlier in
    // the conversation (surfaced via chat()'s visitorName field) — never the
    // 'Widget Customer' placeholder. There is no `phone` field at all any
    // more: the backend sources it exclusively from session memory.
    expect(bookCallArgs.customerName).toBe('Jamie Rivera');
    expect(bookCallArgs).not.toHaveProperty('phone');
  });

  it('asks for the visitor\'s name before booking when the AI never captured one (emergency-triage path)', async () => {
    // Overrides the shared beforeEach mock: this session's second chat()
    // response has bookingTriggered but no visitorName — mirrors the
    // emergency-triage blueprints (hvac.emergency, plumbing.emergency),
    // which gate booking on phone alone (see default-blueprints.ts).
    mockedClient.chat
      .mockReset()
      .mockResolvedValueOnce({ reply: 'Hi! How can I help?', stage: 'greeting', bookingTriggered: false, visitorName: null })
      .mockResolvedValueOnce({ reply: 'Dispatching help now!', stage: 'booking', bookingTriggered: true, visitorName: null });

    mockedClient.book.mockResolvedValue({
      appointmentId: 'appt-2',
      confirmationNumber: 'LF-TEST2',
      conversationId: 'server-conv-id-2',
      leadId: 'lead-2',
      customerName: 'Alex Chen',
      service: 'HVAC Service',
      date: '2026-09-05',
      time: '09:00',
      displayDate: 'Sep 5',
      displayTime: '9:00 AM',
      estimatedDuration: 60,
      address: 'Not provided',
    });

    const user = userEvent.setup();
    render(<ChatWidget />);

    await user.click(screen.getByRole('button', { name: /open chat assistant/i }));
    await screen.findByText('Hi! How can I help?', {}, FIND_TIMEOUT);

    const textarea = screen.getByLabelText('Chat message');
    await user.type(textarea, 'My furnace is dead, send someone now');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    const slotList = await screen.findByRole('list', { name: /available appointment slots/i }, FIND_TIMEOUT);
    await user.click(within(slotList).getByRole('listitem'));

    await screen.findByText(/to confirm or/i, {}, FIND_TIMEOUT);
    await user.type(screen.getByLabelText('Chat message'), 'yes');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    // No name known — the collectName form appears instead of an immediate
    // booking call.
    await screen.findByText(/what's your name/i, {}, FIND_TIMEOUT);
    expect(mockedClient.book).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/your name/i), 'Alex Chen');
    await user.click(screen.getByRole('button', { name: /continue/i }));

    await screen.findByText(/appointment is confirmed/i, {}, FIND_TIMEOUT);

    expect(mockedClient.book).toHaveBeenCalledTimes(1);
    const bookCallArgs = mockedClient.book.mock.calls[0][0];
    expect(bookCallArgs.customerName).toBe('Alex Chen');
    expect(bookCallArgs).not.toHaveProperty('phone');
  });
});
