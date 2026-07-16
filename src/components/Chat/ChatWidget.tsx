import React, { useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { MessageCircle, X } from 'lucide-react';
import { ChatWindow } from './ChatWindow';
import { useChat } from '../../hooks/useChat';
import { useConversation } from '../../hooks/useConversation';

/**
 * ChatWidget — floating launcher + expandable chat window.
 * Pure presentation layer. All conversation logic lives in useConversation → backend.
 */
export function ChatWidget() {
  const { visibility, open, close, minimize } = useChat();
  const { state, sendMessage, initConversation, resetConversation } = useConversation();

  const isOpen      = visibility === 'open';
  const isMinimized = visibility === 'minimized';

  useEffect(() => {
    if (isOpen) initConversation();
  }, [isOpen, initConversation]);

  // Escape key closes the widget
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && isOpen) close();
  }, [isOpen, close]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const aiMessageCount = state.messages.filter(m => m.sender === 'ai').length;

  return (
    <div className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-50 flex flex-col items-end gap-3">

      {/* Expanded chat window */}
      <AnimatePresence>
        {isOpen && (
          <ChatWindow
            state={state}
            onSend={sendMessage}
            onMinimize={minimize}
            onClose={close}
            onReset={resetConversation}
          />
        )}
      </AnimatePresence>

      {/* Minimized pill */}
      <AnimatePresence>
        {isMinimized && (
          <motion.button
            initial={{ opacity: 0, scale: 0.85, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            onClick={open}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white pl-3 pr-4 py-2.5 rounded-full shadow-lg shadow-indigo-500/30 transition-colors text-[13px] font-semibold"
            aria-label="Reopen chat"
          >
            <MessageCircle className="h-4 w-4 flex-shrink-0" />
            <span>Chat with us</span>
            {aiMessageCount > 0 && (
              <span className="bg-white text-indigo-600 text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0">
                {Math.min(aiMessageCount, 9)}
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Launcher FAB */}
      <AnimatePresence mode="wait">
        {visibility === 'closed' && (
          <motion.button
            key="fab-closed"
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.7, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            onClick={open}
            className="w-14 h-14 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-full shadow-xl shadow-indigo-500/40 flex items-center justify-center transition-colors"
            aria-label="Open chat assistant"
            aria-haspopup="dialog"
          >
            <MessageCircle className="h-6 w-6" />
          </motion.button>
        )}

        {isOpen && (
          <motion.button
            key="fab-open"
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.7, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            onClick={close}
            className="w-14 h-14 bg-slate-800 hover:bg-slate-900 active:scale-95 text-white rounded-full shadow-xl flex items-center justify-center transition-colors"
            aria-label="Close chat"
          >
            <X className="h-5 w-5" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
