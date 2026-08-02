/**
 * prompt-assembly/PromptSections.ts
 *
 * Wraps content in named prompt sections using consistent tags.
 * Enforces the canonical section order.
 * Pure functions.
 */

import type { PromptSection } from './types';

/** Wrap content in a named section tag */
export function wrapSection(section: PromptSection, content: string): string {
  const content_trimmed = content.trim();
  if (!content_trimmed) return '';
  return `[${section}]\n${content_trimmed}\n[/${section}]`;
}

/**
 * Join non-empty sections with double newlines.
 * Enforces that no section appears twice.
 */
export function joinSections(sections: Array<{ name: PromptSection; content: string }>): {
  text:             string;
  sectionsIncluded: PromptSection[];
} {
  const seen = new Set<PromptSection>();
  const parts: string[] = [];
  const included: PromptSection[] = [];

  for (const { name, content } of sections) {
    if (seen.has(name)) continue;   // never duplicate
    seen.add(name);
    const trimmed = content.trim();
    if (!trimmed) continue;         // skip empty
    parts.push(trimmed);
    included.push(name);
  }

  return { text: parts.join('\n\n'), sectionsIncluded: included };
}
