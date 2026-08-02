/**
 * prompt-assembly/KnowledgeSerializer.ts
 *
 * Serializes knowledge hits into a prompt block.
 * Limits to maxSnippets (default 3). Omits section entirely if empty.
 * Pure function.
 */

import type { KnowledgeEntry } from '../ai/types';

const DEFAULT_MAX_SNIPPETS = 3;

export function serializeKnowledge(
  hits:        readonly KnowledgeEntry[],
  maxSnippets = DEFAULT_MAX_SNIPPETS,
): string {
  if (!hits || hits.length === 0) return '';

  const window = hits.slice(0, maxSnippets);
  const lines  = ['[KNOWLEDGE BASE]'];

  for (const hit of window) {
    lines.push(`## ${hit.title}`);
    lines.push(hit.content.trim());
    if (hit.tags?.length > 0) lines.push(`Tags: ${hit.tags.join(', ')}`);
    lines.push('');
  }

  lines.push('[/KNOWLEDGE BASE]');
  return lines.join('\n').trim();
}
