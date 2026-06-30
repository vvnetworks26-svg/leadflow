import React, { useState, useCallback } from 'react';
import { apiService } from '../../services/api';
import { Appointment, AppointmentStatus, AppointmentType, Lead } from '../../types';
import { useAppointments } from '../../hooks/useAppointments';
import { AppointmentDetails } from '../../components/Appointments/AppointmentDetails';
import {
  Plus, Calendar, Clock, Phone, Briefcase, UserCheck,
  Trash2, X, AlertCircle, Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ─── Status badge colours ───────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  Scheduled:   'bg-slate-50 text-slate-600 border-slate-100',
  Confirmed:   'bg-indigo-50 text-indigo-700 border-indigo-100',
  Completed:   'bg-emerald-50 text-emerald-700 border-emerald-100',
  Canceled:    'bg-red-50 text-red-700 border-red-100',
  'No Show':   'bg-amber-50 text-amber-700 border-amber-100',
  Pending:     'bg-slate-50 text-slate-500 border-slate-100',
  Rescheduled: 'bg-purple-50 text-purple-700 border-purple-100'
};

const TECHNICIANS = [
  'Mike Reynolds (Senior Tech)',
  'Chris Miller (Tune-ups)',
  'Dave Carter (Project Manager)',
  'Standby Dispatch'
];

export default function Appointments() {
  const { appointments, loading, refresh, updateStatus } = useAppointments();
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [search, setSearch] = useState('');

  // Detail drawer
  const [selectedApt, setSelectedApt] = useState<Appointment | null>(null);

  // Manual scheduler modal
  const [isSchedulerOpen, setIsSchedulerOpen] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [aptDate, setAptDate] = useState('');
  const [aptTime, setAptTime] = useState('');
  const [aptType, setAptType] = useState<AppointmentType>('Repair Consultation');
  const [assignedTech, setAssignedTech] = useState(TECHNICIANS[0]);
  const [aptNotes, setAptNotes] = useState('');
  const [aptDuration, setAptDuration] = useState('90');
  const [saving, setSaving] = useState(false);

  const openScheduler = async () => {
    const data = await apiService.getLeads();
    setLeads(data);
    if (data.length > 0) setSelectedLeadId(data[0].id);
    setIsSchedulerOpen(true);
  };

  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const parentLead = leads.find(l => l.id === selectedLeadId);
      if (!parentLead) throw new Error('Select a valid lead.');

      await apiService.createAppointment({
        leadId: selectedLeadId,
        leadName: parentLead.name,
        leadPhone: parentLead.phone,
        date: aptDate,
        time: aptTime,
        duration: parseInt(aptDuration) || 90,
        type: aptType,
        status: 'Scheduled',
        notes: aptNotes,
        assignedTechnician: assignedTech,
        value: parentLead.value,
        source: 'Manual',
        createdAt: new Date().toISOString()
      });

      setIsSchedulerOpen(false);
      setAptDate(''); setAptTime(''); setAptNotes('');
      await refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = useCallback(async (id: string, status: AppointmentStatus) => {
    await updateStatus(id, status);
    // Sync selected drawer if open
    setSelectedApt(prev => prev?.id === id ? { ...prev, status } : prev);
  }, [updateStatus]);

  // ── Derived lists ──────────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0];

  const filtered = appointments.filter(apt => {
    const matchStatus = statusFilter === 'All' || apt.status === statusFilter;
    const matchSearch = !search ||
      apt.leadName.toLowerCase().includes(search.toLowerCase()) ||
      apt.leadPhone.includes(search) ||
      apt.type.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const todayCount = appointments.filter(a => a.date === today).length;
  const upcomingCount = appointments.filter(a => (a.status === 'Scheduled' || a.status === 'Confirmed') && a.date > today).length;

  return (
    <div className="space-y-6 relative min-h-[80vh]">

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h2 className="font-display font-extrabold text-2xl text-slate-900 tracking-tight">HVAC Dispatch Schedule</h2>
          <p className="text-sm text-slate-500">Manage on-site evaluations, tune-ups, and system replacements.</p>
        </div>
        <button
          onClick={openScheduler}
          className="inline-flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm px-4.5 py-2.5 rounded-lg transition shadow-md shadow-indigo-100"
        >
          <Plus className="h-4 w-4" />
          <span>Dispatch Technician</span>
        </button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Today's Appointments", value: todayCount, color: 'text-indigo-700' },
          { label: 'Upcoming', value: upcomingCount, color: 'text-emerald-700' },
          { label: 'Completed', value: appointments.filter(a => a.status === 'Completed').length, color: 'text-slate-700' },
          { label: 'Cancelled', value: appointments.filter(a => a.status === 'Canceled').length, color: 'text-red-600' }
        ].map(stat => (
          <div key={stat.label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm text-left">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{stat.label}</p>
            <p className={`font-display text-2xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Filter + Search */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div className="flex flex-wrap gap-1.5">
          {['All', 'Confirmed', 'Scheduled', 'Completed', 'Canceled', 'No Show', 'Rescheduled'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition ${
                statusFilter === s
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="relative max-w-xs w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search customer or type..."
            className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-xs bg-slate-50/50"
          />
        </div>
      </div>

      {/* Appointment Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading && appointments.length === 0 ? (
          <div className="col-span-2 py-12 text-center text-xs text-slate-500">
            <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-indigo-600 mx-auto mb-2" />
            Syncing dispatch logs…
          </div>
        ) : filtered.length === 0 ? (
          <div className="col-span-2 py-12 text-center text-xs text-slate-400 bg-white border border-slate-200 rounded-xl shadow-sm">
            No appointments found for "{statusFilter}".
            {statusFilter !== 'All' && <button onClick={() => setStatusFilter('All')} className="ml-2 text-indigo-600 font-semibold">Show all</button>}
          </div>
        ) : (
          filtered.map(apt => (
            <div
              key={apt.id}
              onClick={() => setSelectedApt(apt)}
              className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm hover:shadow-md hover:border-indigo-200 transition cursor-pointer flex flex-col justify-between space-y-4"
            >
              {/* Card header */}
              <div className="flex items-start justify-between">
                <div className="space-y-1 text-left">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_COLORS[apt.status] ?? STATUS_COLORS.Scheduled}`}>
                    {apt.status}
                  </span>
                  {apt.confirmationNumber && (
                    <p className="text-[9px] font-mono text-slate-400">{apt.confirmationNumber}</p>
                  )}
                  <h3 className="font-display font-bold text-base text-slate-950">{apt.leadName}</h3>
                  <p className="text-xs text-slate-400 font-semibold flex items-center space-x-1">
                    <Phone className="h-3 w-3" />
                    <span>{apt.leadPhone}</span>
                  </p>
                </div>

                <select
                  value={apt.status}
                  onClick={e => e.stopPropagation()}
                  onChange={e => handleStatusChange(apt.id, e.target.value as AppointmentStatus)}
                  className="px-2 py-1 rounded-md border border-slate-200 outline-none text-[10px] font-bold bg-slate-50 text-slate-700"
                >
                  {['Scheduled','Confirmed','Completed','Canceled','No Show','Rescheduled'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Parameters grid */}
              <div className="border-t border-b border-slate-100 py-3 grid grid-cols-2 gap-3 text-left text-xs">
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Date & Time</span>
                  <span className="font-bold text-slate-800 flex items-center space-x-1">
                    <Calendar className="h-3.5 w-3.5 text-indigo-500" />
                    <span>{apt.date} • {apt.time}</span>
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Technician</span>
                  <span className="font-semibold text-slate-800 flex items-center space-x-1">
                    <UserCheck className="h-3.5 w-3.5 text-indigo-400" />
                    <span className="truncate">{apt.assignedTechnician ?? 'Unassigned'}</span>
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Service</span>
                  <span className="font-semibold text-slate-800 flex items-center space-x-1">
                    <Briefcase className="h-3.5 w-3.5 text-indigo-300" />
                    <span className="truncate">{apt.type}</span>
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Duration</span>
                  <span className="font-semibold text-slate-800 flex items-center space-x-1">
                    <Clock className="h-3.5 w-3.5 text-indigo-500" />
                    <span>{apt.duration} min</span>
                  </span>
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-900">
                  Est. ${apt.value?.toLocaleString() ?? '—'}
                </span>
                {apt.source && (
                  <span className="font-mono text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md text-[10px]">{apt.source}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Appointment Detail Drawer */}
      <AppointmentDetails
        appointment={selectedApt}
        onClose={() => setSelectedApt(null)}
        onStatusChange={handleStatusChange}
        onRefresh={refresh}
      />

      {/* Manual Scheduler Modal */}
      <AnimatePresence>
        {isSchedulerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 0.4 }} exit={{ opacity: 0 }}
              onClick={() => setIsSchedulerOpen(false)}
              className="fixed inset-0 bg-black z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-2xl z-[55] p-6 max-h-[90vh] flex flex-col"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <div className="flex items-center space-x-2">
                  <Calendar className="h-5 w-5 text-indigo-600" />
                  <h3 className="font-display font-bold text-lg text-slate-900">Schedule Field Dispatch</h3>
                </div>
                <button onClick={() => setIsSchedulerOpen(false)} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {leads.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 space-y-3">
                  <AlertCircle className="h-8 w-8 text-amber-500 mx-auto" />
                  <p>You need at least one active lead to schedule a dispatch.</p>
                </div>
              ) : (
                <form onSubmit={handleCreateAppointment} className="space-y-4 overflow-y-auto flex-1 text-left pr-1">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Customer Lead</label>
                    <select required value={selectedLeadId} onChange={e => setSelectedLeadId(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 outline-none text-xs bg-slate-50 text-slate-800">
                      {leads.map(l => <option key={l.id} value={l.id}>{l.name} – {l.hvacNeed}</option>)}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Date</label>
                      <input type="date" required value={aptDate} onChange={e => setAptDate(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 outline-none text-xs bg-slate-50 text-slate-800" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Time</label>
                      <input type="time" required value={aptTime} onChange={e => setAptTime(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 outline-none text-xs bg-slate-50 text-slate-800" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Technician</label>
                      <select value={assignedTech} onChange={e => setAssignedTech(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 outline-none text-xs bg-slate-50 text-slate-800">
                        {TECHNICIANS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Duration</label>
                      <select value={aptDuration} onChange={e => setAptDuration(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 outline-none text-xs bg-slate-50 text-slate-800">
                        <option value="60">60 min</option>
                        <option value="90">90 min</option>
                        <option value="120">120 min</option>
                        <option value="240">240 min</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Type</label>
                    <select value={aptType} onChange={e => setAptType(e.target.value as AppointmentType)}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 outline-none text-xs bg-slate-50 text-slate-800">
                      <option value="Maintenance">Maintenance</option>
                      <option value="Repair Consultation">Repair / Diagnostic</option>
                      <option value="System Replacement Quote">Replacement Quote</option>
                      <option value="Emergency Service">Emergency Service</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Notes</label>
                    <textarea rows={3} value={aptNotes} onChange={e => setAptNotes(e.target.value)}
                      placeholder="Diagnostic codes, special instructions..."
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 outline-none text-xs bg-slate-50/50 resize-none text-slate-800" />
                  </div>

                  <div className="border-t border-slate-100 pt-4 flex space-x-3">
                    <button type="button" onClick={() => setIsSchedulerOpen(false)}
                      className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold py-3.5 rounded-lg transition">
                      Cancel
                    </button>
                    <button type="submit" disabled={saving}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-xs font-bold py-3.5 rounded-lg transition shadow-md shadow-indigo-100">
                      {saving ? 'Saving…' : 'Confirm Dispatch'}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
