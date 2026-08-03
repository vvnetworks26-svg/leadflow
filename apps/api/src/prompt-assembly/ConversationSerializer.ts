/**
 * prompt-assembly/ConversationSerializer.ts
 *
 * Serializes conversation history into a prompt block.
 * Trims to the most recent N messages (default 20).
 * Pure function.
 */

import type { ChatMessage } from '../ai/types';

const DEFAULT_MAX_HISTORY = 20;

export function serializeConversation(
  history: readonly ChatMessage[],
  maxMessages = DEFAULT_MAX_HISTORY,
): string {
  if (!history || history.length === 0) return '';

  const window = history.slice(-maxMessages);

  const lines = ['[CONVERSATION HISTORY]'];
  for (const msg of window) {
    const label = msg.role === 'user' ? 'Customer' : 'Assistant';
    lines.push(`${label}: ${msg.content}`);
  }
  lines.push('[/CONVERSATION HISTORY]');

  return lines.join('\n');
}
