import React from 'react';
import { motion } from 'motion/react';
import { Bot } from 'lucide-react';

/**
 * Animated typing indicator — three bouncing dots in an AI bubble.
 * Matches the AI bubble layout so there's no layout shift when the
 * real message appears.
 */
export function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.15 }}
      className="flex items-end gap-2 px-4 mb-2"
    >
      {/* Avatar */}
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center" aria-hidden="true">
        <Bot className="h-3.5 w-3.5 text-indigo-600" />
      </div>

      {/* Dots bubble */}
      <div className="bg-white border border-slate-200/80 shadow-sm rounded-2xl rounded-bl-md px-4 py-3" aria-label="AI is typing" role="status">
        <div className="flex items-center gap-1">
          {[0, 1, 2].map(i => (
            <motion.span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-slate-400 block"
              animate={{ y: [0, -4, 0] }}
              transition={{
                duration: 0.7,
                repeat: Infinity,
                repeatType: 'loop',
                delay: i * 0.15,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
