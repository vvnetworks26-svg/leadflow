/**
 * prompt-assembly/MemorySerializer.ts
 *
 * Serializes RichConversationMemory into a clean prompt block.
 * Never exposes confidence scores, source metadata, or internal fields.
 * Only serializes fields that have a meaningful value.
 * Pure function.
 */

import type { RichConversationMemory } from '../ai/types';

export function serializeMemory(memory: RichConversationMemory): string {
  const lines: string[] = ['[CONVERSATION MEMORY]'];

  // Flat fields (readable values only)
  if (memory.visitorName)   lines.push(`Visitor Name: ${memory.visitorName}`);
  if (memory.company)       lines.push(`Company: ${memory.company}`);
  if (memory.industry)      lines.push(`Industry: ${memory.industry}`);
  if (memory.location)      lines.push(`Location: ${memory.location}`);
  if (memory.employeeCount) lines.push(`Team Size: ${memory.employeeCount}`);
  if (memory.phone)         lines.push(`Phone: ${memory.phone}`);
  if (memory.email)         lines.push(`Email: ${memory.email}`);
  if (memory.budget)        lines.push(`Budget: ${memory.budget}`);
  if (memory.timeline)      lines.push(`Timeline: ${memory.timeline}`);

  // Rich fields — value only (no confidence/source)
  const r = memory.rich;
  if (r?.service?.value)       lines.push(`Service Requested: ${r.service.value}`);
  if (r?.address?.value)       lines.push(`Address: ${r.address.value}`);
  if (r?.zip?.value)           lines.push(`ZIP: ${r.zip.value}`);
  if (r?.preferredTime?.value) lines.push(`Preferred Time: ${r.preferredTime.value}`);
  if (r?.emergency?.value !== null && r?.emergency?.value !== undefined) {
    lines.push(`Emergency: ${r.emergency.value ? 'Yes' : 'No'}`);
  }

  // Arrays
  if (memory.painPoints?.length > 0) {
    lines.push(`Pain Points: ${memory.painPoints.join('; ')}`);
  }
  if (memory.goals?.length > 0) {
    lines.push(`Goals: ${memory.goals.join('; ')}`);
  }
  if (memory.servicesDiscussed?.length > 0) {
    lines.push(`Services Discussed: ${memory.servicesDiscussed.join(', ')}`);
  }
  if (memory.objections?.length > 0) {
    lines.push(`Objections: ${memory.objections.join('; ')}`);
  }

  // Booking
  if (memory.bookingStatus && memory.bookingStatus !== 'none') {
    lines.push(`Booking Status: ${memory.bookingStatus}`);
  }

  // Summary (if generated)
  if (memory.summary) lines.push(`Summary: ${memory.summary}`);

  lines.push('[/CONVERSATION MEMORY]');

  // Return empty string if only the header/footer (nothing meaningful)
  return lines.length > 2 ? lines.join('\n') : '';
}
