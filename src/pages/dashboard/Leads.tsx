import React, { useState, useCallback } from 'react';
import { apiService } from '../../services/api';
import { Lead, LeadStatus, LeadPriority } from '../../types';
import { useLeads } from '../../hooks/useLead';
import { LeadCard } from '../../components/Lead/LeadCard';
import { LeadDetails } from '../../components/Lead/LeadDetails';
import {
  Plus,
  Search,
  X,
  Briefcase,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Leads() {
  const { leads, loading, refresh } = useLeads();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  // Detail drawer
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  // New lead modal
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newLead, setNewLead] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    status: 'New' as LeadStatus,
    priority: 'Medium' as LeadPriority,
    value: '',
    source: 'Manual entry',
    hvacNeed: 'AC Repair',
    notes: ''
  });
  const [saving, setSaving] = useState(false);

  // Filter leads
  const filteredLeads = leads.filter((lead) => {
    const matchesSearch =
      lead.name.toLowerCase().includes(search.toLowerCase()) ||
      lead.email.toLowerCase().includes(search.toLowerCase()) ||
      lead.phone.includes(search) ||
      lead.hvacNeed.toLowerCase().includes(search.toLowerCase());

    const matchesStatus = statusFilter === 'All' || lead.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiService.createLead({
        name: newLead.name,
        email: newLead.email,
        phone: newLead.phone,
        address: newLead.address,
        status: newLead.status,
        priority: newLead.priority,
        value: parseFloat(newLead.value) || 0,
        source: newLead.source,
        hvacNeed: newLead.hvacNeed,
        notes: newLead.notes
      });
      setIsAddOpen(false);
      setNewLead({
        name: '',
        email: '',
        phone: '',
        address: '',
        status: 'New',
        priority: 'Medium',
        value: '',
        source: 'Manual entry',
        hvacNeed: 'AC Repair',
        notes: ''
      });
      await refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = useCallback(
    async (id: string, status: LeadStatus) => {
      try {
        const updated = await apiService.updateLead(id, { status });
        setSelectedLead(updated);
        await refresh();
      } catch (err) {
        console.error(err);
      }
    },
    [refresh]
  );

  const handlePriorityChange = useCallback(
    async (id: string, priority: LeadPriority) => {
      try {
        const updated = await apiService.updateLead(id, { priority });
        setSelectedLead(updated);
        await refresh();
      } catch (err) {
        console.error(err);
      }
    },
    [refresh]
  );

  const handleDeleteLead = useCallback(
    async (id: string) => {
      if (!window.confirm('Are you sure you want to delete this lead?')) return;
      try {
        await apiService.deleteLead(id);
        setSelectedLead(null);
        await refresh();
      } catch (err) {
        console.error(err);
      }
    },
    [refresh]
  );

  return (
    <div className="space-y-6 relative min-h-[80vh]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h2 className="font-display font-extrabold text-2xl text-slate-900 tracking-tight">
            Active Leads Pipeline
          </h2>
          <p className="text-sm text-slate-500">
            Capture, filter, and assign standby opportunities for dispatchers.
          </p>
        </div>
        <button
          onClick={() => setIsAddOpen(true)}
          className="inline-flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm px-4.5 py-2.5 rounded-lg transition shadow-md shadow-indigo-100"
        >
          <Plus className="h-4 w-4" />
          <span>Add New Lead</span>
        </button>
      </div>

      {/* Filter + Search */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="relative rounded-lg max-w-sm w-full">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by client, need, or email..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-xs bg-slate-50/50"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {['All', 'New', 'Contacted', 'Qualified', 'Unqualified', 'Proposal', 'Closed Won', 'Closed Lost'].map(
            (status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition ${
                  statusFilter === status
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {status}
              </button>
            )
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/60 border-b border-slate-200">
                <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Customer Info
                </th>
                <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  HVAC Service Required
                </th>
                <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Deal Value
                </th>
                <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Priority
                </th>
                <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Channel Source
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && leads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-xs text-slate-500">
                    <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-indigo-600 mx-auto mb-2" />
                    Syncing database...
                  </td>
                </tr>
              ) : filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-xs text-slate-400">
                    No leads found matching the filter criteria.
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => (
                  <LeadCard key={lead.id} lead={lead} onClick={setSelectedLead} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lead Details Drawer */}
      <LeadDetails
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
        onStatusChange={handleStatusChange}
        onPriorityChange={handlePriorityChange}
        onDelete={handleDeleteLead}
      />

      {/* Add New Lead Modal */}
      <AnimatePresence>
        {isAddOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddOpen(false)}
              className="fixed inset-0 bg-black z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-2xl z-55 p-6 max-h-[90vh] flex flex-col"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <div className="flex items-center space-x-2">
                  <Briefcase className="h-5 w-5 text-indigo-600" />
                  <h3 className="font-display font-bold text-lg text-slate-900">
                    Add Dispatch Opportunity
                  </h3>
                </div>
                <button
                  onClick={() => setIsAddOpen(false)}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>

              <form
                onSubmit={handleAddSubmit}
                className="space-y-4 overflow-y-auto flex-1 pr-1 text-left"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Customer Name
                    </label>
                    <input
                      type="text"
                      required
                      value={newLead.name}
                      onChange={(e) => setNewLead({ ...newLead, name: e.target.value })}
                      placeholder="Jane Doe"
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-xs bg-slate-50/50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Email
                    </label>
                    <input
                      type="email"
                      value={newLead.email}
                      onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
                      placeholder="jane@doe.com"
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-xs bg-slate-50/50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Phone
                    </label>
                    <input
                      type="tel"
                      required
                      value={newLead.phone}
                      onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                      placeholder="(555) 000-0000"
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-xs bg-slate-50/50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Est. Deal Value ($)
                    </label>
                    <input
                      type="number"
                      required
                      value={newLead.value}
                      onChange={(e) => setNewLead({ ...newLead, value: e.target.value })}
                      placeholder="e.g. 8500"
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-xs bg-slate-50/50"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Dispatch Address
                  </label>
                  <input
                    type="text"
                    value={newLead.address}
                    onChange={(e) => setNewLead({ ...newLead, address: e.target.value })}
                    placeholder="123 Peach Street NW, Atlanta, GA"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-xs bg-slate-50/50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      HVAC Service Needed
                    </label>
                    <select
                      value={newLead.hvacNeed}
                      onChange={(e) => setNewLead({ ...newLead, hvacNeed: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 outline-none text-xs bg-slate-50"
                    >
                      <option value="AC Repair">AC Repair</option>
                      <option value="Heat Pump Install">Heat Pump Install</option>
                      <option value="Maintenance">Annual Maintenance</option>
                      <option value="System Replacement Quote">Replacement Quote</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Channel Source
                    </label>
                    <select
                      value={newLead.source}
                      onChange={(e) => setNewLead({ ...newLead, source: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 outline-none text-xs bg-slate-50"
                    >
                      <option value="Manual Entry">Manual Entry</option>
                      <option value="Web Widget">Web Widget</option>
                      <option value="Google Ad">Google Ad</option>
                      <option value="Yelp Referral">Yelp Referral</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Diagnostic Details
                  </label>
                  <textarea
                    rows={3}
                    value={newLead.notes}
                    onChange={(e) => setNewLead({ ...newLead, notes: e.target.value })}
                    placeholder="Provide diagnostic codes, technician directives, or hardware descriptions..."
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 outline-none text-xs bg-slate-50/50 resize-none"
                  />
                </div>

                <div className="border-t border-slate-100 pt-4 flex space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsAddOpen(false)}
                    className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold py-3.5 rounded-lg transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-xs font-bold py-3.5 rounded-lg transition shadow-md shadow-indigo-100"
                  >
                    {saving ? 'Saving...' : 'Save Dispatch Opportunity'}
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
