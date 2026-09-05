/**
 * useConversation.sessionRetry.test.tsx
 *
 * Regression test for an intermittent production stall: POST
 * /:token/session would sometimes fail or hang after its OPTIONS
 * preflight succeeded (confirmed via live server logs — no retry logic
 * existed anywhere in this path, and the server logs proved the POST
 * sometimes never even reached the server, ruling out a server-side
 * cause). With no retry, the visitor either saw total silence, or — once
 * the client's old default timeout eventually fired — a misleading
 * generic fallback greeting with no real session, so any real message
 * typed afterward failed with "Session not ready yet".
 *
 * initConversation() now makes one automatic retry with a short timeout,
 * surfacing `reconnecting: true` in ChatState while it happens instead of
 * leaving the visitor staring at nothing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useConversation } from '../useConversation';

vi.mock('@leadflow/shared/widgetApiClient', () => {
  const createSession = vi.fn();
  const chat = vi.fn();
  return {
    widgetApiClient: { createSession, chat, getConfig: vi.fn(), getToken: () => 'test-token' },
  };
});

vi.mock('../../services/calendar/calendarService', () => ({
  calendarService: { getAvailableSlots: vi.fn() },
}));

import { widgetApiClient } from '@leadflow/shared/widgetApiClient';

describe('useConversation — session-creation retry', () => {
  beforeEach(() => {
    vi.mocked(widgetApiClient.createSession).mockReset();
    vi.mocked(widgetApiClient.chat).mockReset();
  });

  it('retries once after a failed first attempt and succeeds with the real greeting', async () => {
    vi.mocked(widgetApiClient.createSession)
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ widgetSessionId: 'sess-1', schemaVersion: 1, stage: 'greeting', turnCount: 0 });
    vi.mocked(widgetApiClient.chat).mockResolvedValueOnce({
      reply: 'Hi, real personalized greeting', stage: 'greeting', bookingTriggered: false, visitorName: null,
    });

    const { result } = renderHook(() => useConversation());

    await act(async () => {
      await result.current.initConversation();
    });

    await waitFor(() => {
      expect(result.current.state.widgetSessionId).toBe('sess-1');
    });

    expect(widgetApiClient.createSession).toHaveBeenCalledTimes(2);
    expect(result.current.state.reconnecting).toBe(false);
    expect(result.current.state.messages[0]?.text).toBe('Hi, real personalized greeting');
  }, 10_000);

  it('shows the honest fallback (no real session) when both attempts fail — and reconnecting ends up false, not stuck', async () => {
    vi.mocked(widgetApiClient.createSession).mockRejectedValue(new Error('still down'));

    const { result } = renderHook(() => useConversation());

    await act(async () => {
      await result.current.initConversation();
    });

    expect(widgetApiClient.createSession).toHaveBeenCalledTimes(2);
    expect(result.current.state.widgetSessionId).toBeNull();
    expect(result.current.state.reconnecting).toBe(false);
    expect(result.current.state.messages[0]?.text).toMatch(/How can I help you today/);
  }, 10_000);
});
