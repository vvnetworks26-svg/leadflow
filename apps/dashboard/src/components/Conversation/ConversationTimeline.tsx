import React from 'react';
import { Message } from '../../types';
import { Bot, User } from 'lucide-react';

interface Props {
  messages: Message[];
}

/**
 * Renders a conversation transcript as a visual timeline.
 * Used inside LeadDetails to show the full chat history.
 */
export function ConversationTimeline({ messages }: Props) {
  if (messages.length === 0) {
    return (
      <p className="text-[11px] text-slate-400 italic py-2">
        No conversation messages recorded.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {messages.map((msg) => {
        const isAi = msg.sender === 'ai';
        const isUser = msg.sender === 'user';
        const time = new Date(msg.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        });
        const date = new Date(msg.timestamp).toLocaleDateString([], {
          month: 'short',
          day: 'numeric'
        });

        return (
          <div
            key={msg.id}
            className={`flex items-start space-x-2.5 ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}
          >
            {/* Avatar */}
            <div
              className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5 ${
                isAi
                  ? 'bg-indigo-100 text-indigo-600'
                  : isUser
                  ? 'bg-slate-200 text-slate-600'
                  : 'bg-amber-100 text-amber-700'
              }`}
            >
              {isAi ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
            </div>

            <div className={`flex-1 max-w-[85%] ${isUser ? 'items-end flex flex-col' : ''}`}>
              <div
                className={`rounded-xl px-3 py-2 text-[11px] leading-relaxed ${
                  isAi
                    ? 'bg-slate-50 border border-slate-100 text-slate-700 rounded-tl-none'
                    : isUser
                    ? 'bg-indigo-50 border border-indigo-100 text-indigo-900 rounded-tr-none'
                    : 'bg-amber-50 border border-amber-100 text-amber-900 rounded-tl-none'
                }`}
              >
                {!isUser && (
                  <span
                    className={`block text-[9px] font-bold uppercase tracking-wider mb-0.5 ${
                      isAi ? 'text-indigo-500' : 'text-amber-600'
                    }`}
                  >
                    {isAi ? 'AI Assistant' : 'Agent'}
                  </span>
                )}
                {msg.text}
              </div>
              <p className="text-[9px] text-slate-400 mt-0.5 px-1">
                {date} • {time}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
