import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { MessageCircle, X } from 'lucide-react';
import { ChatWindow } from './ChatWindow';
import { useChat } from '../../hooks/useChat';
import { useConversation } from '../../hooks/useConversation';

/**
 * ChatWidget — the floating launcher + expandable chat window.
 *
 * Drop this component anywhere in the tree (typically App.tsx or a layout).
 * It renders a fixed bottom-right button and the chat panel on top of all content.
 */
export function ChatWidget() {
  const { visibility, open, close, minimize, toggle } = useChat();
  const { state, sendMessage, resetConversation } = useConversation();

  const isOpen = visibility === 'open';
  const isMinimized = visibility === 'minimized';

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end space-y-3">
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
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            onClick={open}
            className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-full shadow-lg shadow-indigo-200 transition text-xs font-semibold"
            aria-label="Open chat"
          >
            <MessageCircle className="h-4 w-4" />
            <span>Chat with us</span>
            {state.messages.length > 1 && (
              <span className="bg-white text-indigo-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {state.messages.filter((m) => m.sender === 'ai').length}
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Launcher FAB */}
      <AnimatePresence mode="wait">
        {visibility === 'closed' && (
          <motion.button
            key="launcher-closed"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={open}
            className="w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-xl shadow-indigo-200 flex items-center justify-center transition"
            aria-label="Open chat assistant"
            aria-haspopup="dialog"
          >
            <MessageCircle className="h-6 w-6" />
          </motion.button>
        )}

        {isOpen && (
          <motion.button
            key="launcher-open"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={close}
            className="w-14 h-14 bg-slate-700 hover:bg-slate-800 text-white rounded-full shadow-xl flex items-center justify-center transition"
            aria-label="Close chat"
          >
            <X className="h-5 w-5" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
