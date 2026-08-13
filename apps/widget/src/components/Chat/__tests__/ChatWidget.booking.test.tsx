/**
 * ChatWidget.booking.test.tsx
 *
 * Regression test for a real bug found and fixed in this change: the
 * widget's actual booking form (SlotPicker → confirm) was still sending
 * the old, now-unsupported `conversationId` field to POST /:token/book
 * instead of the `widgetSessionId` the backend has required since Track 1.
 *
 * This renders the real component tree (ChatWidget → ChatWindow →
 * ChatInput/ChatBubble/SlotPicker) and drives it through actual user
 * interaction (click, type, click) — not just a hook-level or API-contract
 * check — so a regression in the prop-wiring between components, not just
 * the request payload, would also be caught.
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
    // user message that triggers the booking sub-flow.
    mockedClient.chat
      .mockResolvedValueOnce({ reply: 'Hi! How can I help?', stage: 'greeting', bookingTriggered: false })
      .mockResolvedValueOnce({ reply: "Let's get you booked!", stage: 'booking', bookingTriggered: true });

    mockedCalendar.getAvailableSlots.mockResolvedValue([
      { date: '2026-09-05', time: '09:00', displayDate: 'Sep 5', displayTime: '9:00 AM', available: true },
    ]);

    mockedClient.book.mockResolvedValue({
      appointmentId: 'appt-1',
      confirmationNumber: 'LF-TEST1',
      conversationId: 'server-conv-id',
      leadId: 'lead-1',
      customerName: 'Widget Customer',
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
  });
});
