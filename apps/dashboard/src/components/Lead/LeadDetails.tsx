import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  MapPin,
  Phone,
  Mail,
  Briefcase,
  DollarSign,
  Sparkles,
  Trash2,
  AlertTriangle,
  MessageSquare,
  ShieldCheck,
  ShieldX,
  Clock,
  Calendar,
  Tag
} from 'lucide-react';
import { Lead, LeadStatus, LeadPriority, Conversation } from '../../types';
import { conversationsApi } from '../../services/api/conversations';
import { ConversationTimeline } from '../Conversation/ConversationTimeline';

interface Props {
  lead: Lead | null;
  onClose: () => void;
  onStatusChange: (id: string, status: LeadStatus) => void;
  onPriorityChange: (id: string, priority: LeadPriority) => void;
  onDelete: (id: string) => void;
}

const statusColors: Record<LeadStatus, string> = {
  'New': 'bg-slate-50 text-slate-600 border-slate-100',
  'Contacted': 'bg-amber-50 text-amber-700 border-amber-100',
  'Qualified': 'bg-indigo-50 text-indigo-700 border-indigo-100',
  'Unqualified': 'bg-red-50 text-red-700 border-red-100',
  'Proposal': 'bg-purple-50 text-purple-700 border-purple-100',
  'Closed Won': 'bg-emerald-50 text-emerald-700 border-emerald-100',
  'Closed Lost': 'bg-red-50 text-red-700 border-red-100'
};

/**
 * Full lead detail side drawer.
 * Shows customer info, qualification result, conversation transcript, and timeline.
 */
export function LeadDetails({ lead, onClose, onStatusChange, onPriorityChange, onDelete }: Props) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'conversation'>('info');

  // Load conversation transcript when lead changes
  useEffect(() => {
    if (lead?.conversationId) {
      conversationsApi.getById(lead.conversationId).then((c) => setConversation(c ?? null));
    } else {
      setConversation(null);
    }
  }, [lead?.conversationId]);

  return (
    <AnimatePresence>
      {lead && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black z-30"
            aria-hidden="true"
          />

          {/* Drawer */}
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 220 }}
            className="fixed inset-y-0 right-0 w-full sm:max-w-md bg-white border-l border-slate-200 shadow-2xl z-40 flex flex-col"
            role="complementary"
            aria-label={`Lead details for ${lead.name}`}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 flex-shrink-0">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest flex items-center space-x-1">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>CRM Customer Profile</span>
                </span>
                <h3 className="font-display font-bold text-lg text-slate-950 flex items-center space-x-2">
                  <span>{lead.name}</span>
                  {lead.emergency && (
                    <span className="inline-flex items-center space-x-1 bg-red-50 border border-red-100 text-red-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                      <AlertTriangle className="h-2.5 w-2.5" />
                      <span>EMERGENCY</span>
                    </span>
                  )}
                </h3>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition"
                aria-label="Close lead details"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-100 px-6 flex-shrink-0">
              {(['info', 'conversation'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`py-2.5 mr-4 text-xs font-semibold border-b-2 transition capitalize ${
                    activeTab === tab
                      ? 'border-indigo-600 text-indigo-700'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                  disabled={tab === 'conversation' && !lead.conversationId}
                >
                  {tab === 'conversation' ? (
                    <span className="flex items-center space-x-1">
                      <MessageSquare className="h-3.5 w-3.5" />
                      <span>Transcript</span>
                      {!lead.conversationId && (
                        <span className="text-[9px] text-slate-400">(none)</span>
                      )}
                    </span>
                  ) : (
                    'Info'
                  )}
                </button>
              ))}
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {activeTab === 'info' ? (
                <>
                  {/* Status + Priority */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1 text-left">
                      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                        Status
                      </label>
                      <select
                        value={lead.status}
                        onChange={(e) => onStatusChange(lead.id, e.target.value as LeadStatus)}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 outline-none text-xs font-semibold bg-slate-50 text-slate-800"
                      >
                        <option value="New">New</option>
                        <option value="Contacted">Contacted</option>
                        <option value="Qualified">Qualified</option>
                        <option value="Unqualified">Unqualified</option>
                        <option value="Proposal">Proposal</option>
                        <option value="Closed Won">Closed Won</option>
                        <option value="Closed Lost">Closed Lost</option>
                      </select>
                    </div>
                    <div className="space-y-1 text-left">
                      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                        Priority
                      </label>
                      <select
                        value={lead.priority}
                        onChange={(e) => onPriorityChange(lead.id, e.target.value as LeadPriority)}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 outline-none text-xs font-semibold bg-slate-50 text-slate-800"
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                      </select>
                    </div>
                  </div>

                  {/* Contact info */}
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-3 text-left text-xs text-slate-600">
                    <div className="flex items-center space-x-3">
                      <MapPin className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      <span>{lead.address || '—'}</span>
                    </div>
                    {lead.zipCode && (
                      <div className="flex items-center space-x-3">
                        <Tag className="h-4 w-4 text-slate-400 flex-shrink-0" />
                        <span>ZIP: {lead.zipCode}</span>
                      </div>
                    )}
                    <div className="flex items-center space-x-3">
                      <Phone className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      <span className="font-semibold">{lead.phone || '—'}</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <Mail className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      <span>{lead.email || '—'}</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <Briefcase className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      <span className="font-bold text-slate-900">Need: {lead.hvacNeed}</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <DollarSign className="h-4 w-4 text-indigo-600 flex-shrink-0" />
                      <span className="font-extrabold text-slate-900">
                        Est. Deal Value: ${lead.value.toLocaleString()}
                      </span>
                    </div>
                    {lead.preferredDay && (
                      <div className="flex items-center space-x-3">
                        <Calendar className="h-4 w-4 text-slate-400 flex-shrink-0" />
                        <span>Preferred day: {lead.preferredDay}</span>
                      </div>
                    )}
                  </div>

                  {/* Qualification result */}
                  {lead.qualificationReason && (
                    <div className="space-y-2 text-left">
                      <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                        Qualification Result
                      </h4>
                      <div
                        className={`flex items-start space-x-2.5 p-3 rounded-xl border text-xs ${
                          lead.status === 'Qualified'
                            ? 'bg-indigo-50 border-indigo-100 text-indigo-800'
                            : 'bg-red-50 border-red-100 text-red-800'
                        }`}
                      >
                        {lead.status === 'Qualified' ? (
                          <ShieldCheck className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        ) : (
                          <ShieldX className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        )}
                        <p>{lead.qualificationReason}</p>
                      </div>
                    </div>
                  )}

                  {/* Timeline */}
                  <div className="space-y-2 text-left">
                    <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                      Timeline
                    </h4>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2 text-xs text-slate-600">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        <span>
                          Created:{' '}
                          {new Date(lead.createdAt).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                      {lead.updatedAt && (
                        <div className="flex items-center space-x-2 text-xs text-slate-600">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          <span>
                            Updated:{' '}
                            {new Date(lead.updatedAt).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center space-x-2 text-xs text-slate-600">
                        <Tag className="h-3.5 w-3.5 text-slate-400" />
                        <span>Source: {lead.source}</span>
                      </div>
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="space-y-2 text-left">
                    <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                      Notes
                    </h4>
                    <p className="bg-[#FFFDF9] border border-amber-100 p-4 rounded-xl text-xs text-slate-700 leading-relaxed font-medium">
                      {lead.notes || 'No notes added yet.'}
                    </p>
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center space-x-2 text-xs text-slate-500">
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span className="font-semibold">
                      {conversation?.messages.length ?? 0} messages in this conversation
                    </span>
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                        statusColors[lead.status] ?? 'bg-slate-50 text-slate-600 border-slate-100'
                      }`}
                    >
                      {lead.status}
                    </span>
                  </div>

                  {conversation ? (
                    <ConversationTimeline messages={conversation.messages} />
                  ) : (
                    <p className="text-xs text-slate-400 italic">
                      No conversation transcript available for this lead.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="border-t border-slate-100 px-6 py-4 flex space-x-3 flex-shrink-0">
              <button
                onClick={() => onDelete(lead.id)}
                className="flex-1 inline-flex items-center justify-center space-x-2 border border-red-200 hover:bg-red-50 text-red-600 text-xs font-bold py-3 rounded-lg transition"
                aria-label="Delete lead"
              >
                <Trash2 className="h-4 w-4" />
                <span>Delete Lead</span>
              </button>
              <button
                onClick={onClose}
                className="flex-1 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold py-3 rounded-lg transition"
              >
                Close Details
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
