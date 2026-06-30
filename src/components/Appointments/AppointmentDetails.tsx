import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Phone, Mail, MapPin, Calendar, Clock, UserCheck, Hash,
  Tag, Sparkles, Wrench, FileText, AlertTriangle
} from 'lucide-react';
import { Appointment, AppointmentStatus, Conversation } from '../../types';
import { conversationsApi } from '../../services/api/conversations';
import { ConversationTimeline } from '../Conversation/ConversationTimeline';
import { AppointmentTimeline } from './AppointmentTimeline';
import { calendarService } from '../../services/calendar/calendarService';
import { notificationService } from '../../services/notifications/notificationService';

interface Props {
  appointment: Appointment | null;
  onClose: () => void;
  onStatusChange: (id: string, status: AppointmentStatus) => void;
  onRefresh: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  Scheduled:   'bg-slate-50 text-slate-600 border-slate-100',
  Confirmed:   'bg-indigo-50 text-indigo-700 border-indigo-100',
  Completed:   'bg-emerald-50 text-emerald-700 border-emerald-100',
  Canceled:    'bg-red-50 text-red-700 border-red-100',
  'No Show':   'bg-amber-50 text-amber-700 border-amber-100',
  Pending:     'bg-slate-50 text-slate-500 border-slate-100',
  Rescheduled: 'bg-purple-50 text-purple-700 border-purple-100'
};

type Tab = 'info' | 'timeline' | 'conversation';

/**
 * AppointmentDetails — full side drawer for a single appointment.
 * Shows customer info, appointment timeline, conversation transcript,
 * and mock reschedule / cancel actions.
 */
export function AppointmentDetails({ appointment, onClose, onStatusChange, onRefresh }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('info');
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [rescheduling, setRescheduling] = useState(false);

  useEffect(() => {
    if (appointment?.conversationId) {
      conversationsApi.getById(appointment.conversationId).then(c => setConversation(c ?? null));
    } else {
      setConversation(null);
    }
    setActiveTab('info');
  }, [appointment?.id, appointment?.conversationId]);

  const handleCancel = async () => {
    if (!appointment) return;
    if (!window.confirm('Cancel this appointment?')) return;
    await calendarService.cancelAppointment(appointment.id);
    notificationService.info('Appointment Cancelled', `${appointment.leadName}'s appointment has been cancelled.`);
    onRefresh();
    onClose();
  };

  const handleMockReschedule = async () => {
    if (!appointment) return;
    setRescheduling(true);
    // Mock: just flag status as Rescheduled and advance date by 1 day
    const tomorrow = new Date(appointment.date);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    const dow = tomorrow.getDay();
    const dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dow];
    await calendarService.rescheduleAppointment(appointment.id, {
      date: tomorrowStr,
      time: appointment.time,
      displayDate: `${dayName}, ${tomorrow.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      displayTime: appointment.time,
      available: true
    });
    notificationService.info('Appointment Rescheduled', `Moved to ${tomorrowStr}`);
    onRefresh();
    setRescheduling(false);
    onClose();
  };

  if (!appointment) return null;

  const statusColor = STATUS_COLORS[appointment.status] ?? STATUS_COLORS.Scheduled;

  return (
    <AnimatePresence>
      {appointment && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black z-30"
            aria-hidden="true"
          />

          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 220 }}
            className="fixed inset-y-0 right-0 w-full sm:max-w-md bg-white border-l border-slate-200 shadow-2xl z-40 flex flex-col"
            role="complementary"
            aria-label={`Appointment details for ${appointment.leadName}`}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 flex-shrink-0">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest flex items-center space-x-1">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Appointment Details</span>
                </span>
                <div className="flex items-center space-x-2">
                  <h3 className="font-display font-bold text-lg text-slate-950">{appointment.leadName}</h3>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${statusColor}`}>
                    {appointment.status}
                  </span>
                </div>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-100 px-6 flex-shrink-0">
              {(['info', 'timeline', 'conversation'] as Tab[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  disabled={tab === 'conversation' && !appointment.conversationId}
                  className={`py-2.5 mr-4 text-xs font-semibold border-b-2 transition capitalize ${
                    activeTab === tab
                      ? 'border-indigo-600 text-indigo-700'
                      : 'border-transparent text-slate-500 hover:text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed'
                  }`}
                >
                  {tab}
                  {tab === 'conversation' && !appointment.conversationId && (
                    <span className="ml-1 text-[9px] text-slate-400">(none)</span>
                  )}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {activeTab === 'info' && (
                <>
                  {/* Status selector */}
                  <div className="space-y-1.5 text-left">
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Status</label>
                    <select
                      value={appointment.status}
                      onChange={e => onStatusChange(appointment.id, e.target.value as AppointmentStatus)}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 outline-none text-xs font-semibold bg-slate-50 text-slate-800"
                    >
                      {['Scheduled','Confirmed','Completed','Canceled','No Show','Pending','Rescheduled'].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  {/* Confirmation number */}
                  {appointment.confirmationNumber && (
                    <div className="flex items-center space-x-2 text-xs text-slate-600 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2.5">
                      <Hash className="h-4 w-4 text-indigo-500 flex-shrink-0" />
                      <span className="font-mono font-bold text-indigo-800">{appointment.confirmationNumber}</span>
                    </div>
                  )}

                  {/* Core info */}
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-3 text-xs text-slate-600 text-left">
                    <div className="flex items-center space-x-3">
                      <Phone className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      <span className="font-semibold">{appointment.leadPhone}</span>
                    </div>
                    {appointment.customerEmail && (
                      <div className="flex items-center space-x-3">
                        <Mail className="h-4 w-4 text-slate-400 flex-shrink-0" />
                        <span>{appointment.customerEmail}</span>
                      </div>
                    )}
                    {appointment.address && (
                      <div className="flex items-center space-x-3">
                        <MapPin className="h-4 w-4 text-slate-400 flex-shrink-0" />
                        <span>{appointment.address}</span>
                      </div>
                    )}
                    <div className="flex items-center space-x-3">
                      <Calendar className="h-4 w-4 text-indigo-500 flex-shrink-0" />
                      <span className="font-bold text-slate-800">{appointment.date} at {appointment.time}</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <Clock className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      <span>{appointment.duration} min estimated</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <Wrench className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      <span className="font-bold text-slate-800">{appointment.type}</span>
                    </div>
                    {appointment.assignedTechnician && (
                      <div className="flex items-center space-x-3">
                        <UserCheck className="h-4 w-4 text-slate-400 flex-shrink-0" />
                        <span>{appointment.assignedTechnician}</span>
                      </div>
                    )}
                    {appointment.source && (
                      <div className="flex items-center space-x-3">
                        <Tag className="h-4 w-4 text-slate-400 flex-shrink-0" />
                        <span>Source: {appointment.source}</span>
                      </div>
                    )}
                  </div>

                  {/* Notes */}
                  <div className="space-y-2 text-left">
                    <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Notes</h4>
                    <p className="bg-[#FFFDF9] border border-amber-100 p-4 rounded-xl text-xs text-slate-700 leading-relaxed font-medium">
                      {appointment.notes || 'No notes recorded.'}
                    </p>
                  </div>
                </>
              )}

              {activeTab === 'timeline' && (
                <AppointmentTimeline appointment={appointment} />
              )}

              {activeTab === 'conversation' && (
                <div className="space-y-3">
                  {conversation ? (
                    <ConversationTimeline messages={conversation.messages} />
                  ) : (
                    <p className="text-xs text-slate-400 italic">No conversation transcript linked to this appointment.</p>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-slate-100 px-6 py-4 flex space-x-3 flex-shrink-0">
              <button
                onClick={handleCancel}
                disabled={appointment.status === 'Canceled' || appointment.status === 'Completed'}
                className="flex-1 border border-red-200 hover:bg-red-50 text-red-600 text-xs font-bold py-3 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Cancel Appt.
              </button>
              <button
                onClick={handleMockReschedule}
                disabled={rescheduling || appointment.status === 'Canceled' || appointment.status === 'Completed'}
                className="flex-1 border border-indigo-200 hover:bg-indigo-50 text-indigo-700 text-xs font-bold py-3 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {rescheduling ? 'Rescheduling…' : 'Reschedule'}
              </button>
              <button
                onClick={onClose}
                className="flex-1 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold py-3 rounded-lg transition"
              >
                Close
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
