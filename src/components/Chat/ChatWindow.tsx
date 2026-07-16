import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Minus, RotateCcw, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ChatBubble } from './ChatBubble';
import { TypingIndicator } from './TypingIndicator';
import { ChatInput } from './ChatInput';
import { ChatState } from '../../types';

interface Props {
  state: ChatState;
  onSend: (text: string) => void;
  onMinimize: () => void;
  onClose: () => void;
  onReset: () => void;
}

export function ChatWindow({ state, onSend, onMinimize, onClose, onReset }: Props) {
  const scrollRef      = useRef<HTMLDivElement>(null);
  const bottomRef      = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);

  const { stage, bookingState, isTyping, loading, messages } = state;
  const isCompleted = stage === 'completed' && !isTyping;
  const isBooked    = bookingState.phase === 'booked';

  // Track whether user has manually scrolled away from the bottom
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAtBottom(distanceFromBottom < 60);
  }, []);

  // Auto-scroll only when user is already at the bottom
  useEffect(() => {
    if (atBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping, atBottom]);

  // Always snap to bottom on first message or reset
  useEffect(() => {
    if (messages.length <= 1) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' });
      setAtBottom(true);
    }
  }, [messages.length]);

  const handleSlotSelect = (index: number) => onSend(String(index));

  const inputDisabled =
    isTyping ||
    loading ||
    isCompleted ||
    bookingState.phase === 'selectSlot' ||
    bookingState.phase === 'loadingSlots' ||
    bookingState.phase === 'booking';

  const inputPlaceholder =
    bookingState.phase === 'selectSlot'   ? 'Select a time slot above…'
    : bookingState.phase === 'loadingSlots' || bookingState.phase === 'booking'
                                            ? 'Please wait…'
    : isCompleted                           ? 'Conversation complete'
                                            : 'Message…';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 12 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      /* Full-width on mobile with safe-area, fixed width on desktop */
      className={[
        'flex flex-col overflow-hidden',
        'bg-white rounded-2xl',
        'shadow-2xl shadow-slate-900/20',
        'border border-slate-200/80',
        /* Mobile: almost full-width, taller to handle soft keyboard */
        'w-[calc(100vw-2.5rem)] max-h-[80svh]',
        /* sm+: fixed width */
        'sm:w-[390px] sm:max-h-[600px]',
        'h-[540px]',
      ].join(' ')}
      role="dialog"
      aria-label="LeadFlow AI Chat Assistant"
      aria-modal="true"
    >

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-gradient-to-r from-indigo-600 to-indigo-500">
        <div className="flex items-center gap-3 min-w-0">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center ring-2 ring-white/30">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            {/* Online dot */}
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-indigo-500" aria-hidden="true" />
          </div>

          <div className="min-w-0 leading-tight">
            <p className="text-sm font-semibold text-white truncate">LeadFlow AI</p>
            <p className="text-[11px] text-indigo-200 font-medium">
              Typically replies instantly
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {isCompleted && (
            <button
              onClick={onReset}
              className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/15 transition-colors"
              aria-label="Start a new conversation"
              title="New conversation"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={onMinimize}
            className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/15 transition-colors"
            aria-label="Minimize chat"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/15 transition-colors"
            aria-label="Close chat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Message list ───────────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overscroll-contain py-4 bg-slate-50 scroll-smooth"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#e2e8f0 transparent' }}
        aria-live="polite"
        aria-label="Conversation messages"
        aria-atomic="false"
      >
        {/* Empty / loading state */}
        {messages.length === 0 && !isTyping && (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
            <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-indigo-500" />
            </div>
            <p className="text-sm font-medium text-slate-500">Starting conversation…</p>
          </div>
        )}

        <div className="space-y-0.5">
          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => (
              <React.Fragment key={msg.id}>
                <ChatBubble
                  message={msg}
                  isFirstInGroup={idx === 0 || messages[idx - 1]?.sender !== msg.sender}
                  isLastInGroup={idx === messages.length - 1 || messages[idx + 1]?.sender !== msg.sender}
                  onSlotSelect={handleSlotSelect}
                />
              </React.Fragment>
            ))}
          </AnimatePresence>
        </div>

        {/* Typing indicator */}
        <AnimatePresence>
          {isTyping && <TypingIndicator />}
        </AnimatePresence>

        {/* Completion state */}
        <AnimatePresence>
          {isCompleted && !isBooked && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-4 mt-3"
            >
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-center space-y-0.5">
                <p className="text-xs font-semibold text-emerald-800">All set!</p>
                <p className="text-[11px] text-emerald-600">We'll be in touch shortly.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={bottomRef} className="h-px" aria-hidden="true" />
      </div>

      {/* Scroll-to-bottom nudge */}
      <AnimatePresence>
        {!atBottom && messages.length > 2 && (
          <motion.button
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            onClick={() => {
              bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
              setAtBottom(true);
            }}
            className="absolute bottom-[68px] left-1/2 -translate-x-1/2 bg-white border border-slate-200 text-slate-600 text-[11px] font-medium px-3 py-1 rounded-full shadow-md hover:shadow-lg transition-shadow"
            aria-label="Scroll to latest message"
          >
            ↓ Latest message
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Input ──────────────────────────────────────────────────────────── */}
      <ChatInput
        onSend={onSend}
        disabled={inputDisabled}
        placeholder={inputPlaceholder}
      />
    </motion.div>
  );
}
