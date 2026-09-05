/**
 * ChatWindow.bookingFailure.test.tsx
 *
 * Regression test for the P0 bug: after POST /widget/:token/book returned
 * 422 (booking rejected — see finalizeBooking's failure branch in
 * useConversation.ts), ChatWindow still rendered "All set! We'll be in
 * touch shortly." — a false success message shown to a visitor whose
 * appointment was never created. The banner's condition only excluded
 * bookingState.phase === 'booked'; a rejected booking left phase at
 * 'idle', which looked identical to "no booking was ever attempted."
 *
 * Renders the real component with real props — no mocking of ChatWindow
 * itself — so this exercises the actual fixed condition
 * (isCompleted && !isBooked && !isBookingFailed), not a reimplementation
 * of it.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatWindow } from '../ChatWindow';
import type { ChatState } from '../../../types';

const noop = () => {};

function baseState(overrides: Partial<ChatState> = {}): ChatState {
  return {
    messages: [],
    widgetSessionId: 'test-session',
    isTyping: false,
    stage: 'completed',
    visitorName: 'Jamie',
    bookingState: { phase: 'idle', availableSlots: [] },
    loading: false,
    error: null,
    ...overrides,
  };
}

describe('ChatWindow — booking completion banner', () => {
  it('does NOT show "All set!" when the booking failed (phase: failed)', () => {
    const state = baseState({
      bookingState: { phase: 'failed', availableSlots: [] },
      messages: [
        {
          id: '1', sender: 'ai', timestamp: new Date(),
          text: 'Something went wrong while booking your appointment. Our team will reach out to you directly to confirm.',
        },
      ],
    });

    render(<ChatWindow state={state} onSend={noop} onMinimize={noop} onClose={noop} onReset={noop} />);

    expect(screen.queryByText('All set!')).not.toBeInTheDocument();
    expect(screen.getByText(/Something went wrong while booking/)).toBeInTheDocument();
  });

  it('does NOT show "All set!" when the booking succeeded (phase: booked) — the detailed confirmation message covers it', () => {
    const state = baseState({
      bookingState: {
        phase: 'booked', availableSlots: [],
        confirmation: {
          appointmentId: 'a1', confirmationNumber: 'LF-TEST01',
          customerName: 'Jamie', service: 'AC Repair', date: '2026-12-15', time: '14:00',
          displayDate: 'Dec 15', displayTime: '2:00 PM', estimatedDuration: 60, address: '123 Main St',
        },
      },
    });

    render(<ChatWindow state={state} onSend={noop} onMinimize={noop} onClose={noop} onReset={noop} />);

    expect(screen.queryByText('All set!')).not.toBeInTheDocument();
  });

  it('DOES show "All set!" for an ordinary completed conversation where no booking was ever attempted', () => {
    const state = baseState({
      bookingState: { phase: 'idle', availableSlots: [] },
    });

    render(<ChatWindow state={state} onSend={noop} onMinimize={noop} onClose={noop} onReset={noop} />);

    expect(screen.getByText('All set!')).toBeInTheDocument();
  });
});
