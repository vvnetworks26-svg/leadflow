/**
 * memory-engine/MemorySummarizer.ts
 * Produces a human-readable summary from a MemoryProfile. Pure, deterministic.
 * No LLM — template-based only.
 */
import type { MemoryItem } from './MemoryTypes';

function findValue(items: readonly MemoryItem[], key: string): string | null {
  const item = items.find(i => i.key === key && i.value !== null);
  return item ? String(item.value) : null;
}

export function summarizeMemory(items: readonly MemoryItem[]): string {
  const parts: string[] = [];

  const name    = findValue(items, 'visitorName');
  const company = findValue(items, 'company');
  const phone   = findValue(items, 'phone');
  const service = findValue(items, 'service');
  const booking = findValue(items, 'bookingStatus');
  const budget  = findValue(items, 'budget');
  const timeline= findValue(items, 'timeline');

  if (name)    parts.push(`Customer: ${name}${company ? ` from ${company}` : ''}.`);
  if (phone)   parts.push(`Phone: ${phone}.`);
  if (service) parts.push(`Service needed: ${service}.`);
  if (booking && booking !== 'none') parts.push(`Booking status: ${booking}.`);
  if (budget)  parts.push(`Budget: ${budget}.`);
  if (timeline)parts.push(`Timeline: ${timeline}.`);

  const pains = items.filter(i => i.key === 'painPoints' && Array.isArray(i.value));
  if (pains.length > 0) {
    const vals = (pains[0].value as string[]).slice(0, 2).join('; ');
    if (vals) parts.push(`Pain points: ${vals}.`);
  }

  return parts.length > 0 ? parts.join(' ') : 'No significant memory collected yet.';
}
