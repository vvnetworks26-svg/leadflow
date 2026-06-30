import React from 'react';
import { Calendar, Clock } from 'lucide-react';
import { TimeSlot } from '../../types';

interface Props {
  slots: TimeSlot[];
  onSelect: (index: number) => void;
}

/**
 * Inline slot picker rendered inside the chat window when the AI
 * presents available appointment times. Sends the slot number as
 * a user message when clicked.
 */
export function SlotPicker({ slots, onSelect }: Props) {
  return (
    <div className="px-4 py-2">
      <div className="space-y-2">
        {slots.map((slot, i) => (
          <button
            key={`${slot.date}-${slot.time}`}
            onClick={() => onSelect(i + 1)}
            className="w-full flex items-center space-x-3 bg-white border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 rounded-xl px-3 py-2.5 text-left transition group"
            aria-label={`Select ${slot.displayDate} at ${slot.displayTime}`}
          >
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 group-hover:bg-indigo-600 text-indigo-600 group-hover:text-white text-[10px] font-bold flex items-center justify-center transition">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-800 truncate">{slot.displayDate}</p>
              <p className="text-[10px] text-slate-500 flex items-center space-x-1">
                <Clock className="h-2.5 w-2.5" />
                <span>{slot.displayTime}</span>
              </p>
            </div>
            <Calendar className="h-3.5 w-3.5 text-slate-300 group-hover:text-indigo-500 flex-shrink-0 transition" />
          </button>
        ))}
      </div>
    </div>
  );
}
