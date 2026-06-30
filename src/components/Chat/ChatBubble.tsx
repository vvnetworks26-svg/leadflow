import React from 'react';
import { Bot } from 'lucide-react';
import { ChatMessage } from '../../types';
import { SlotPicker } from './SlotPicker';
import { BookingConfirmationCard } from './BookingConfirmationCard';

interface Props {
  message: ChatMessage;
  key?: React.Key;
  onSlotSelect?: (index: number) => void;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Single chat bubble.
 * AI messages can carry an optional slots[] or confirmation payload
 * that renders an interactive widget below the text.
 */
export function ChatBubble({ message, onSlotSelect }: Props) {
  const isAi = message.sender === 'ai';

  if (isAi) {
    return (
      <div className="flex items-start space-x-2 px-4 py-1">
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center mt-0.5">
          <Bot className="h-3.5 w-3.5 text-indigo-600" />
        </div>

        <div className="max-w-[90%] space-y-1 w-full">
          {/* Text bubble — render markdown-style ** bold */}
          {message.text && (
            <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none px-4 py-2.5 shadow-sm">
              <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-line">
                {message.text}
              </p>
            </div>
          )}

          {/* Slot picker widget */}
          {message.slots && message.slots.length > 0 && onSlotSelect && (
            <SlotPicker slots={message.slots} onSelect={onSlotSelect} />
          )}

          {/* Booking confirmation card */}
          {message.confirmation && (
            <BookingConfirmationCard confirmation={message.confirmation} />
          )}

          <p className="text-[10px] text-slate-400 pl-1">{formatTime(message.timestamp)}</p>
        </div>
      </div>
    );
  }

  // User bubble
  return (
    <div className="flex items-start justify-end px-4 py-1">
      <div className="max-w-[78%] space-y-1">
        <div className="bg-indigo-600 rounded-2xl rounded-tr-none px-4 py-2.5 shadow-sm shadow-indigo-100">
          <p className="text-xs text-white leading-relaxed">{message.text}</p>
        </div>
        <p className="text-[10px] text-slate-400 text-right pr-1">{formatTime(message.timestamp)}</p>
      </div>
    </div>
  );
}
