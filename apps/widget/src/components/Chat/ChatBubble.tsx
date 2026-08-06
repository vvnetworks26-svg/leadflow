import React from 'react';
import { motion } from 'motion/react';
import { Bot } from 'lucide-react';
import { ChatMessage } from '../../types';
import { SlotPicker } from './SlotPicker';
import { BookingConfirmationCard } from './BookingConfirmationCard';

interface Props {
  message: ChatMessage;
  /** First message in a consecutive run from the same sender */
  isFirstInGroup?: boolean;
  /** Last message in a consecutive run from the same sender */
  isLastInGroup?: boolean;
  onSlotSelect?: (index: number) => void;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Render inline **bold** markers as actual bold spans.
 * e.g. "Type **yes** to confirm" → "Type <b>yes</b> to confirm"
 */
function renderText(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

export function ChatBubble({ message, isFirstInGroup = true, isLastInGroup = true, onSlotSelect }: Props) {
  const isAi = message.sender === 'ai';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
      className={`flex items-end gap-2 px-4 ${isLastInGroup ? 'mb-2' : 'mb-0.5'} ${isAi ? '' : 'flex-row-reverse'}`}
    >
      {/* AI avatar — only show on last in group */}
      {isAi && (
        <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center self-end ${isLastInGroup ? 'bg-indigo-100 opacity-100' : 'opacity-0 pointer-events-none'}`} aria-hidden="true">
          <Bot className="h-3.5 w-3.5 text-indigo-600" />
        </div>
      )}

      <div className={`flex flex-col gap-1 ${isAi ? 'items-start max-w-[82%]' : 'items-end max-w-[78%]'} w-full`}>

        {/* Text bubble */}
        {message.text && (
          <div
            className={[
              'px-3.5 py-2.5 text-[13px] leading-relaxed',
              isAi
                ? [
                    'bg-white text-slate-800 border border-slate-200/80 shadow-sm',
                    isFirstInGroup && isLastInGroup ? 'rounded-2xl rounded-bl-md'
                    : isFirstInGroup               ? 'rounded-2xl rounded-bl-md rounded-br-2xl'
                    : isLastInGroup                ? 'rounded-2xl rounded-tl-md rounded-bl-md'
                                                   : 'rounded-lg rounded-l-md',
                  ].join(' ')
                : [
                    'bg-indigo-600 text-white shadow-sm shadow-indigo-500/20',
                    isFirstInGroup && isLastInGroup ? 'rounded-2xl rounded-br-md'
                    : isFirstInGroup               ? 'rounded-2xl rounded-br-md rounded-bl-2xl'
                    : isLastInGroup                ? 'rounded-2xl rounded-tr-md rounded-br-md'
                                                   : 'rounded-lg rounded-r-md',
                  ].join(' '),
            ].join(' ')}
          >
            <p className="whitespace-pre-wrap break-words">
              {renderText(message.text)}
            </p>
          </div>
        )}

        {/* Slot picker */}
        {message.slots && message.slots.length > 0 && onSlotSelect && (
          <SlotPicker slots={message.slots} onSelect={onSlotSelect} />
        )}

        {/* Booking confirmation */}
        {message.confirmation && (
          <BookingConfirmationCard confirmation={message.confirmation} />
        )}

        {/* Timestamp — only on last bubble in group */}
        {isLastInGroup && (
          <p className={`text-[10px] text-slate-400 px-1 ${isAi ? 'pl-1' : 'pr-1 text-right'}`}>
            {formatTime(message.timestamp)}
          </p>
        )}
      </div>
    </motion.div>
  );
}
