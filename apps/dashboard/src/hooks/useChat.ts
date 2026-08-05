import { useState, useCallback } from 'react';

export type ChatVisibility = 'closed' | 'open' | 'minimized';

/**
 * useChat — manages the visibility state of the floating chat widget.
 */
export function useChat() {
  const [visibility, setVisibility] = useState<ChatVisibility>('closed');

  const open = useCallback(() => setVisibility('open'), []);
  const close = useCallback(() => setVisibility('closed'), []);
  const minimize = useCallback(() => setVisibility('minimized'), []);
  const toggle = useCallback(
    () => setVisibility((v) => (v === 'open' ? 'minimized' : 'open')),
    []
  );

  return { visibility, open, close, minimize, toggle };
}
