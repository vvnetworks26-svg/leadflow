import React, { useEffect, useRef } from 'react';
import { X, Minus, Sparkles, RotateCcw } from 'lucide-react';
import { motion } from 'motion/react';
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
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages, state.isTyping]);

  const isCompleted = state.step === 'completed' && !state.isTyping;
  const isBooked = Boolean(state.appointmentId);

  /**
   * When the user clicks a slot button, we synthesise the number as
   * a text message so the conversation engine processes it normally.
   */
  const handleSlotSelect = (index: number) => {
    onSend(String(index));
  };

  const inputDisabled =
    state.isTyping ||
    state.step === 'completed' ||
    // Also disable when in selectSlot and slots are shown (force button interaction)
    (state.step === 'selectSlot' && (state.data.availableSlots?.length ?? 0) > 0);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 10 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="w-80 sm:w-96 h-[560px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
      role="dialog"
      aria-label="HVAC Chat Assistant"
      aria-modal="true"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-indigo-600 text-white flex-shrink-0">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="leading-tight">
            <p className="text-xs font-bold">LeadFlow HVAC</p>
            <div className="flex items-center space-x-1.5 text-[10px] text-indigo-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>AI Assistant • Online</span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-1">
          {isCompleted && (
            <button
              onClick={onReset}
              className="p-1.5 rounded-lg hover:bg-indigo-500 transition text-indigo-200 hover:text-white"
              aria-label="Start new conversation"
              title="Start over"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={onMinimize}
            className="p-1.5 rounded-lg hover:bg-indigo-500 transition text-indigo-200 hover:text-white"
            aria-label="Minimize chat"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-indigo-500 transition text-indigo-200 hover:text-white"
            aria-label="Close chat"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Message list */}
      <div
        className="flex-1 overflow-y-auto py-3 space-y-1 bg-slate-50"
        aria-live="polite"
        aria-label="Conversation messages"
      >
        {state.messages.map((msg) => (
          <ChatBubble
            key={msg.id}
            message={msg}
            onSlotSelect={handleSlotSelect}
          />
        ))}

        {state.isTyping && <TypingIndicator />}

        {/* Completed without booking */}
        {isCompleted && !isBooked && (
          <div className="px-4 py-2">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-center space-y-1">
              <p className="text-xs font-bold text-emerald-800">Request received!</p>
              <p className="text-[10px] text-emerald-700">Your info has been saved. We'll be in touch shortly.</p>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <ChatInput
        onSend={onSend}
        disabled={inputDisabled}
        placeholder={
          state.step === 'selectSlot'
            ? 'Select a time slot above…'
            : isCompleted
            ? 'Conversation complete'
            : 'Type your reply…'
        }
      />
    </motion.div>
  );
}
