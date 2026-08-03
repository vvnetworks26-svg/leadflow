/**
 * tool-orchestration/MemoryBugFixes.ts
 *
 * BUG-H1 Fix: Stable MemoryItem IDs.
 *
 * Before Layer 7 / MemoryProfile integration with MongoDB, MemoryEngine.process()
 * was regenerating a new random UUID for every MemoryItem on every call.
 * This meant the same memory field (e.g. "phone: 555-1234") would get a different
 * ID every turn, making deduplication and conflict resolution unreliable.
 *
 * Fix: deterministic ID = SHA-1-like hash of (organizationId + conversationId + key).
 * Implemented as a pure utility — no crypto module, no Node built-ins that vary.
 *
 * This file is imported by MemoryEngine (Layer 6) and is tested in Layer 7 tests.
 */

/**
 * Produce a deterministic, stable ID for a memory item.
 *
 * The ID is derived from:
 *   organizationId + conversationId + key
 *
 * so the same field for the same conversation always produces the same ID,
 * regardless of how many times MemoryEngine.process() is called.
 *
 * Algorithm: djb2 hash (fast, deterministic, no dependencies).
 */
export function stableMemoryId(
  organizationId: string,
  conversationId: string,
  key:            string,
): string {
  const input = `${organizationId}|${conversationId}|${key}`;
  let   hash  = 5381;

  for (let i = 0; i < input.length; i++) {
    // djb2: hash * 33 + char
    hash = ((hash << 5) + hash) + input.charCodeAt(i);
    // Keep within 32-bit signed integer range
    hash = hash & hash;
  }

  // Convert to hex string, always 8 chars, prefix with 'mem-'
  const hex = (hash >>> 0).toString(16).padStart(8, '0');
  return `mem-${hex}`;
}

/**
 * BUG-M3 Fix: Injectable clock for business_closed rule.
 *
 * The original rule read `Date.now()` directly, making it
 * clock-dependent and impossible to test without real-clock sleeps.
 *
 * Replace usage:
 *   const now = Date.now();   // ← hard to test
 * with:
 *   const now = getNowMs();   // ← injectable in tests
 */
export type ClockFn = () => number;

/**
 * Default clock — returns real system time.
 * Override in tests by passing a mock function.
 */
export const realClock: ClockFn = () => Date.now();

/**
 * Check if the business is currently closed, given:
 *   - openTime:  'HH:MM' (e.g. '09:00')
 *   - closeTime: 'HH:MM' (e.g. '17:00')
 *   - timezone:  IANA timezone string (e.g. 'America/Chicago')
 *   - nowMs:     injectable clock (default: Date.now())
 *
 * Returns true if the current local time is OUTSIDE open–close window.
 */
export function isBusinessClosed(
  openTime:  string,
  closeTime: string,
  timezone:  string,
  nowMs:     number = Date.now(),
): boolean {
  try {
    const now    = new Date(nowMs);
    const locale = now.toLocaleString('en-US', {
      hour:     '2-digit',
      minute:   '2-digit',
      hour12:   false,
      timeZone: timezone,
    });

    // locale format: "HH:MM"
    const [rawH, rawM] = locale.split(':').map(Number);
    const curMinutes   = rawH * 60 + rawM;

    const [oh, om]     = openTime.split(':').map(Number);
    const [ch, cm]     = closeTime.split(':').map(Number);
    const openMinutes  = oh * 60 + om;
    const closeMinutes = ch * 60 + cm;

    return curMinutes < openMinutes || curMinutes >= closeMinutes;
  } catch {
    // If timezone is invalid, default to "open" to avoid blocking the conversation
    return false;
  }
}

/**
 * BUG-L1 Fix: correct intent mapping for 'Support'.
 *
 * The original mapToIntentCategory() mapped 'Support' → 'repair', which was
 * semantically imprecise. Support should map to 'general_question'.
 *
 * This is a pure lookup table patch — no behaviour change elsewhere.
 */
export const INTENT_CATEGORY_MAP: Record<string, string> = {
  Booking:    'book_appointment',
  Demo:       'book_appointment',
  Pricing:    'request_estimate',
  Support:    'general_question',   // FIX: was 'repair'
  Objection:  'complaint',
  Greeting:   'unknown',
  Question:   'general_question',
  Feature:    'general_question',
  Technical:  'general_question',
  Comparison: 'general_question',
  Automation: 'general_question',
  Website:    'general_question',
  LeadFlow:   'general_question',
  Unknown:    'unknown',
};
