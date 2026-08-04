/**
 * booking-engine/MockCalendarProvider.ts
 *
 * In-memory mock calendar provider for tests and development.
 * Deterministic — never calls any external service.
 */

import type { CalendarEvent, IBookingCalendarProvider } from './types';

interface StoredEvent {
  id:    string;
  event: CalendarEvent;
}

export class MockCalendarProvider implements IBookingCalendarProvider {
  readonly name = 'mock' as const;

  private _events: StoredEvent[] = [];
  private _counter = 0;
  private _shouldFailNext = false;
  private _blockedTimes: Array<{ start: string; end: string }> = [];

  // ─── IBookingCalendarProvider ──────────────────────────────────────────────

  async createEvent(event: CalendarEvent): Promise<string> {
    if (this._shouldFailNext) {
      this._shouldFailNext = false;
      throw new Error('MockCalendarProvider: simulated failure');
    }
    const id = `mock-event-${++this._counter}`;
    this._events.push({ id, event });
    return id;
  }

  async updateEvent(eventId: string, patch: Partial<CalendarEvent>): Promise<void> {
    const idx = this._events.findIndex(e => e.id === eventId);
    if (idx === -1) throw new Error(`MockCalendarProvider: event ${eventId} not found`);
    this._events[idx] = {
      id:    eventId,
      event: { ...this._events[idx]!.event, ...patch },
    };
  }

  async deleteEvent(eventId: string): Promise<void> {
    this._events = this._events.filter(e => e.id !== eventId);
  }

  async isAvailable(startUtc: string, endUtc: string): Promise<boolean> {
    const start = new Date(startUtc).getTime();
    const end   = new Date(endUtc).getTime();

    // Check explicit blocked times
    for (const blocked of this._blockedTimes) {
      const bs = new Date(blocked.start).getTime();
      const be = new Date(blocked.end).getTime();
      if (start < be && end > bs) return false;
    }

    // Check existing events
    for (const { event } of this._events) {
      const es = new Date(event.startUtc).getTime();
      const ee = new Date(event.endUtc).getTime();
      if (start < ee && end > es) return false;
    }

    return true;
  }

  // ─── Test helpers ──────────────────────────────────────────────────────────

  /** Cause the next createEvent call to throw. */
  failNext(): void {
    this._shouldFailNext = true;
  }

  /** Block a time range to simulate an existing booking. */
  blockTime(startUtc: string, endUtc: string): void {
    this._blockedTimes.push({ start: startUtc, end: endUtc });
  }

  /** Get all stored events (for assertions). */
  getEvents(): StoredEvent[] {
    return [...this._events];
  }

  /** Reset all state. */
  reset(): void {
    this._events        = [];
    this._counter       = 0;
    this._shouldFailNext= false;
    this._blockedTimes  = [];
  }
}
