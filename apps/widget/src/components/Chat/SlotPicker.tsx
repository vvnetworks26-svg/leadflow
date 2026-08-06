import React from 'react';
import { motion } from 'motion/react';
import { CalendarDays, Clock } from 'lucide-react';
import { TimeSlot } from '../../types';

interface Props {
  slots: TimeSlot[];
  onSelect: (index: number) => void;
}

/**
 * Inline slot picker rendered inside the chat window.
 * Clicking a slot calls onSelect(1-based index) which feeds back
 * into the conversation as a user message.
 */
export function SlotPicker({ slots, onSelect }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="w-full space-y-1.5 pt-0.5"
      role="list"
      aria-label="Available appointment slots"
    >
      {slots.map((slot, i) => (
        <motion.button
          key={`${slot.date}-${slot.time}`}
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.15, delay: i * 0.05 }}
          onClick={() => onSelect(i + 1)}
          role="listitem"
          className={[
            'w-full flex items-center gap-3 text-left',
            'bg-white hover:bg-indigo-50 active:bg-indigo-100',
            'border border-slate-200 hover:border-indigo-400',
            'rounded-xl px-3 py-2.5 transition-colors group',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
          ].join(' ')}
          aria-label={`Select ${slot.displayDate} at ${slot.displayTime}`}
        >
          {/* Number badge */}
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-50 group-hover:bg-indigo-600 text-indigo-600 group-hover:text-white text-[10px] font-bold flex items-center justify-center transition-colors" aria-hidden="true">
            {i + 1}
          </span>

          {/* Date & time */}
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-slate-800 truncate leading-snug">
              {slot.displayDate}
            </p>
            <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
              <Clock className="h-2.5 w-2.5 flex-shrink-0" aria-hidden="true" />
              {slot.displayTime}
            </p>
          </div>

          <CalendarDays className="h-4 w-4 text-slate-300 group-hover:text-indigo-500 flex-shrink-0 transition-colors" aria-hidden="true" />
        </motion.button>
      ))}
    </motion.div>
  );
}
