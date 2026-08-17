import React, { useState, useEffect, useRef } from 'react';
import { apiService } from '../../services/api';
import { Conversation, Message } from '../../types';
import {
  Bot,
  User,
  MessageSquare,
  Archive,
  Check,
  Clock,
  AlertCircle,
  Phone,
  Search,
  Sparkles
} from 'lucide-react';

export default function Conversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const chatEndRef = useRef<HTMLDivElement>(null);

  const loadConversations = async (selectFirst = true) => {
    try {
      const data = await apiService.getConversations();
      setConversations(data);
      if (selectFirst && data.length > 0 && !activeConvId) {
        setActiveConvId(data[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeConvId, conversations]);

  const activeConv = conversations.find(c => c.id === activeConvId);

  // Toggle archive status
  const handleArchiveStatus = async (id: string, status: 'archived' | 'active' | 'completed') => {
    try {
      await apiService.updateConversationStatus(id, status);
      await loadConversations(true);
    } catch (err) {
      console.error(err);
    }
  };

  const filteredConversations = conversations.filter(c => {
    const matchesSearch = c.leadName.toLowerCase().includes(search.toLowerCase()) || 
                          (c.hvacNeed && c.hvacNeed.toLowerCase().includes(search.toLowerCase()));
    // Show both active and completed conversations; exclude only archived/snoozed
    return matchesSearch && (c.status === 'active' || c.status === 'completed');
  });

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm h-[75vh] flex">
      {/* Sidebar List - Left 1/3 */}
      <div className="w-80 border-r border-slate-200 flex flex-col">
        {/* Search Header */}
        <div className="p-4 border-b border-slate-200 space-y-3">
          <h3 className="font-display font-extrabold text-sm text-slate-950 text-left">Live Support Inbox</h3>
          <div className="relative rounded-lg shadow-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter inbox customer..."
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs bg-slate-50/50 outline-none text-slate-800"
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {loading && conversations.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-indigo-600 mx-auto mb-2"></div>
              Refresing threads...
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="py-8 px-4 text-center text-xs text-slate-400">
              No active conversations. Test the floating booking bot on the Landing Page to create one!
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const lastMsg = conv.messages[conv.messages.length - 1];
              const isActive = conv.id === activeConvId;

              return (
                <button
                  key={conv.id}
                  onClick={() => setActiveConvId(conv.id)}
                  className={`w-full p-4 text-left transition hover:bg-slate-50/70 flex flex-col space-y-1 ${
                    isActive ? 'bg-slate-50 border-l-4 border-indigo-600' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-900">{conv.leadName}</span>
                    <div className="flex items-center space-x-1">
                      {conv.status === 'completed' && (
                        <span className="text-[8px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 rounded-full uppercase">
                          Lead
                        </span>
                      )}
                      <span className="text-[9px] font-mono font-medium text-slate-400">
                        {new Date(conv.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                  {conv.hvacNeed && (
                    <span className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wider">{conv.hvacNeed}</span>
                  )}
                  <p className="text-[11px] text-gray-500 truncate max-w-[220px]">
                    {lastMsg ? lastMsg.text : 'No messages'}
                  </p>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Main Conversation Thread - Right 2/3 */}
      <div className="flex-1 flex flex-col bg-slate-50/40">
        {activeConv ? (
          <>
            {/* Thread Header */}
            <div className="bg-white border-b border-slate-200 p-4 flex items-center justify-between">
              <div className="text-left space-y-0.5">
                <h4 className="font-bold text-sm text-slate-900">{activeConv.leadName}</h4>
                <div className="flex items-center space-x-2 text-[10px] text-slate-400 font-semibold">
                  <span className="flex items-center space-x-1 text-indigo-600">
                    <Phone className="h-3 w-3" />
                    <span>{activeConv.leadPhone}</span>
                  </span>
                  <span>•</span>
                  <span>Need: {activeConv.hvacNeed || 'General Inquiries'}</span>
                </div>
              </div>

              {/* Header Actions */}
              <div className="flex items-center space-x-2">
                <div className="bg-gray-100 text-gray-500 border border-gray-200 rounded-lg px-2.5 py-1 text-[10px] font-semibold flex items-center space-x-1">
                  <span>AI Copilot — Coming Soon</span>
                </div>
                <button
                  onClick={() => handleArchiveStatus(activeConv.id, 'archived')}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition"
                  title="Archive Thread"
                >
                  <Archive className="h-4.5 w-4.5" />
                </button>
              </div>
            </div>

            {/* Messages stage scroll */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {activeConv.messages.map((msg) => {
                const isAgent = msg.sender === 'agent';
                const isAi = msg.sender === 'ai';

                return (
                  <div 
                    key={msg.id}
                    className={`p-3.5 rounded-xl text-xs leading-relaxed max-w-[70%] text-left ${
                      isAgent 
                        ? 'bg-indigo-600 text-white ml-auto rounded-tr-none shadow-md shadow-indigo-50' 
                        : isAi 
                          ? 'bg-white border border-slate-200 text-slate-800 rounded-tl-none font-medium flex items-start space-x-2.5'
                          : 'bg-slate-100 border border-slate-200 text-slate-850 ml-0 rounded-tl-none font-medium'
                    }`}
                  >
                    {isAi && (
                      <div className="bg-indigo-50 p-1 rounded text-indigo-600 mt-0.5 shrink-0">
                        <Bot className="h-3 w-3" />
                      </div>
                    )}
                    <div>
                      {isAi && <span className="text-[9px] font-bold text-indigo-600 uppercase tracking-widest block mb-0.5">Automated Dispatcher</span>}
                      {isAgent && <span className="text-[9px] font-bold text-indigo-200 uppercase tracking-widest block mb-0.5">You (Dispatcher)</span>}
                      {!isAgent && !isAi && <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-0.5">Homeowner Client</span>}
                      <p>{msg.text}</p>
                    </div>
                  </div>
                );
              })}

              <div ref={chatEndRef} />
            </div>

            {/* Replying from the dashboard is not available yet — conversations are read-only for now. */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 text-center text-xs text-slate-400">
              Replying from the dashboard is coming soon. Conversations are read-only for now.
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-4 text-center">
            <MessageSquare className="h-10 w-10 text-gray-300" />
            <h4 className="font-bold text-sm text-gray-800">Support Inbox Idle</h4>
            <p className="text-xs text-gray-400 max-w-sm">No conversation selected or available. Use the web widget on the landing page to trigger fresh real-time customer tickets.</p>
          </div>
        )}
      </div>
    </div>
  );
}
