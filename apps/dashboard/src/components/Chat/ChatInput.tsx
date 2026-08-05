import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';
import { motion } from 'motion/react';

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Chat input bar.
 * - Textarea that auto-resizes up to 4 lines
 * - Enter sends, Shift+Enter inserts a newline
 * - Disabled correctly while AI is responding
 */
export function ChatInput({ onSend, disabled = false, placeholder = 'Message…' }: Props) {
  const [value, setValue]   = useState('');
  const textareaRef         = useRef<HTMLTextAreaElement>(null);
  const canSend             = value.trim().length > 0 && !disabled;

  // Focus when enabled
  useEffect(() => {
    if (!disabled) textareaRef.current?.focus();
  }, [disabled]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    // cap at ~4 lines (approx 96px)
    el.style.height = Math.min(el.scrollHeight, 96) + 'px';
  }, [value]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    // Reset height
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex-shrink-0 px-3 py-2.5 border-t border-slate-200/80 bg-white">
      <div className={[
        'flex items-end gap-2 rounded-xl border transition-colors px-3 py-2',
        disabled
          ? 'bg-slate-50 border-slate-200 cursor-not-allowed'
          : 'bg-white border-slate-200 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-400/20',
      ].join(' ')}>
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={disabled ? 'Please wait…' : placeholder}
          className={[
            'flex-1 resize-none bg-transparent outline-none text-[13px] leading-relaxed',
            'text-slate-800 placeholder:text-slate-400',
            'disabled:cursor-not-allowed disabled:opacity-40',
            'min-h-[22px] max-h-24',
            'py-0.5',
          ].join(' ')}
          aria-label="Chat message"
          aria-multiline="true"
        />

        <motion.button
          type="button"
          onClick={submit}
          disabled={!canSend}
          whileTap={canSend ? { scale: 0.88 } : {}}
          className={[
            'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
            canSend
              ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-500/25'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed',
          ].join(' ')}
          aria-label="Send message"
        >
          <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
        </motion.button>
      </div>

      <p className="text-[10px] text-slate-400 text-center mt-1.5">
        Press <kbd className="font-mono bg-slate-100 px-1 rounded">Enter</kbd> to send
        &nbsp;·&nbsp;
        <kbd className="font-mono bg-slate-100 px-1 rounded">Shift+Enter</kbd> for new line
      </p>
    </div>
  );
}
