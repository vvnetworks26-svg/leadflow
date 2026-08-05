import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Wrench, Plus, Trash2, Check, X, Pencil, AlertCircle, Clock, Zap } from 'lucide-react';
import { ServiceItem } from '../../types';
import { businessServicesService } from '../../services/business/businessServicesService';

const INPUT    = 'w-full px-3.5 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-xs bg-slate-50/50 text-slate-800';
const LABEL    = 'text-xs font-semibold text-slate-500 uppercase tracking-wider';

// ─── Blank service template ───────────────────────────────────────────────────
const BLANK: Omit<ServiceItem, 'id'> = {
  name: '',
  description: '',
  estimatedDuration: 60,
  emergencyAvailable: false,
  active: true
};

// ─── Inline toggle ────────────────────────────────────────────────────────────
function Toggle({ id, checked, onChange, label }: {
  id: string; checked: boolean; onChange: (v: boolean) => void; label?: string;
}) {
  return (
    <label htmlFor={id} className="inline-flex items-center space-x-2 cursor-pointer select-none">
      <div className="relative">
        <input id={id} type="checkbox" className="sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
        <div className={`w-8 h-4 rounded-full transition-colors ${checked ? 'bg-indigo-600' : 'bg-slate-200'}`} />
        <div className={`absolute top-0 left-0 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </div>
      {label && <span className="text-xs text-slate-700 font-medium">{label}</span>}
    </label>
  );
}

// ─── Service form (add / edit) ────────────────────────────────────────────────
interface ServiceFormProps {
  initial: Omit<ServiceItem, 'id'>;
  onSubmit: (data: Omit<ServiceItem, 'id'>) => void;
  onCancel: () => void;
  submitLabel: string;
}

function ServiceForm({ initial, onSubmit, onCancel, submitLabel }: ServiceFormProps) {
  const [form, setForm] = useState(initial);

  function set(patch: Partial<typeof form>) {
    setForm(prev => ({ ...prev, ...patch }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSubmit(form);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-left">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5 sm:col-span-2">
          <label className={LABEL}>Service Name *</label>
          <input required type="text" value={form.name}
            onChange={e => set({ name: e.target.value })}
            placeholder="e.g. AC Repair" className={INPUT} />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label className={LABEL}>Description</label>
          <textarea rows={2} value={form.description}
            onChange={e => set({ description: e.target.value })}
            placeholder="Briefly describe what this service includes…"
            className={`${INPUT} resize-none`} />
        </div>

        <div className="space-y-1.5">
          <label className={LABEL}>Estimated Duration (min)</label>
          <input type="number" min={15} max={600} step={15}
            value={form.estimatedDuration}
            onChange={e => set({ estimatedDuration: Number(e.target.value) })}
            className={INPUT} />
        </div>

        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between">
            <label className={LABEL}>Emergency Available</label>
            <Toggle id={`em-${initial.name}`} checked={form.emergencyAvailable}
              onChange={v => set({ emergencyAvailable: v })} label={form.emergencyAvailable ? 'Yes' : 'No'} />
          </div>
          <div className="flex items-center justify-between">
            <label className={LABEL}>Active</label>
            <Toggle id={`ac-${initial.name}`} checked={form.active}
              onChange={v => set({ active: v })} label={form.active ? 'Active' : 'Inactive'} />
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-2 pt-1">
        <button type="submit"
          className="inline-flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition shadow-sm shadow-indigo-100">
          <Check className="h-3.5 w-3.5" />
          <span>{submitLabel}</span>
        </button>
        <button type="button" onClick={onCancel}
          className="text-xs font-semibold text-slate-500 hover:text-slate-700 border border-slate-200 px-4 py-2.5 rounded-lg transition">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Service row ──────────────────────────────────────────────────────────────
interface RowProps {
  service: ServiceItem;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleActive: (id: string) => void;
  isEditing: boolean;
  onSaveEdit: (id: string, data: Omit<ServiceItem, 'id'>) => void;
  onCancelEdit: () => void;
  key?: React.Key;
}

function ServiceRow({ service, onEdit, onDelete, onToggleActive, isEditing, onSaveEdit, onCancelEdit }: RowProps) {
  const { id, name, description, estimatedDuration, emergencyAvailable, active } = service;

  if (isEditing) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="border border-indigo-200 bg-indigo-50/40 rounded-xl p-4"
      >
        <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-3">Editing — {name}</p>
        <ServiceForm
          initial={{ name, description, estimatedDuration, emergencyAvailable, active }}
          onSubmit={data => onSaveEdit(id, data)}
          onCancel={onCancelEdit}
          submitLabel="Save Changes"
        />
      </motion.div>
    );
  }

  return (
    <div className={`border rounded-xl p-4 flex items-start justify-between gap-4 transition ${active ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-60'}`}>
      <div className="flex-1 min-w-0 space-y-1.5 text-left">
        <div className="flex items-center space-x-2">
          <p className="text-xs font-bold text-slate-900 truncate">{name}</p>
          {emergencyAvailable && (
            <span className="inline-flex items-center space-x-0.5 bg-red-50 border border-red-100 text-red-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0">
              <Zap className="h-2.5 w-2.5" />
              <span>Emergency</span>
            </span>
          )}
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${active ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
            {active ? 'Active' : 'Inactive'}
          </span>
        </div>
        {description && (
          <p className="text-[11px] text-slate-500 leading-normal line-clamp-2">{description}</p>
        )}
        <div className="flex items-center space-x-1 text-[10px] text-slate-400 font-medium">
          <Clock className="h-3 w-3" />
          <span>{estimatedDuration} min</span>
        </div>
      </div>

      <div className="flex items-center space-x-1 flex-shrink-0">
        <button onClick={() => onToggleActive(id)} title={active ? 'Deactivate' : 'Activate'}
          className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition">
          {active
            ? <X className="h-3.5 w-3.5" />
            : <Check className="h-3.5 w-3.5" />}
        </button>
        <button onClick={() => onEdit(id)} title="Edit"
          className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => onDelete(id)} title="Delete"
          className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

/**
 * BusinessServicesTab
 *
 * CRUD for the services catalogue. Changes persist immediately — the AI
 * conversation engine reads businessSettings.services live on the next
 * chat step that asks about services.
 */
export function BusinessServicesTab() {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    setServices(businessServicesService.load());
  }, []);

  function flash() {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  function handleAdd(data: Omit<ServiceItem, 'id'>) {
    const updated = businessServicesService.add(data);
    setServices(updated);
    setAddingNew(false);
    flash();
  }

  function handleSaveEdit(id: string, data: Omit<ServiceItem, 'id'>) {
    const updated = businessServicesService.update(id, data);
    setServices(updated);
    setEditingId(null);
    flash();
  }

  function handleToggleActive(id: string) {
    const updated = businessServicesService.toggleActive(id);
    setServices(updated);
    flash();
  }

  function handleDelete(id: string) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    const updated = businessServicesService.remove(id);
    setServices(updated);
    setConfirmDeleteId(null);
    flash();
  }

  const activeCount = services.filter(s => s.active).length;

  return (
    <div className="space-y-6 text-left">

      {/* Saved banner */}
      <AnimatePresence>
        {saved && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg text-xs font-semibold flex items-center space-x-2">
            <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
            <span>Services updated. The AI will present the new list on the next conversation.</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="font-display font-bold text-sm text-slate-950 flex items-center space-x-2">
            <Wrench className="h-4.5 w-4.5 text-indigo-500" />
            <span>Service Catalogue</span>
            <span className="text-[10px] font-normal text-slate-400">{activeCount} active</span>
          </h3>
          {!addingNew && (
            <button
              onClick={() => { setAddingNew(true); setEditingId(null); }}
              className="inline-flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg transition shadow-sm shadow-indigo-100"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Service</span>
            </button>
          )}
        </div>

        {/* Add new form */}
        <AnimatePresence>
          {addingNew && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="border border-indigo-200 bg-indigo-50/40 rounded-xl p-4 mb-4">
                <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-3">New Service</p>
                <ServiceForm
                  initial={BLANK}
                  onSubmit={handleAdd}
                  onCancel={() => setAddingNew(false)}
                  submitLabel="Add Service"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Service list */}
        {services.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
            No services configured. Add your first service above.
          </div>
        ) : (
          <div className="space-y-3">
            {services.map(svc => (
              <div key={svc.id}>
                {/* Confirm delete prompt */}
                {confirmDeleteId === svc.id && (
                  <div className="flex items-center space-x-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-1 text-xs">
                    <AlertCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                    <span className="text-red-700 font-medium flex-1">Delete "{svc.name}"?</span>
                    <button onClick={() => handleDelete(svc.id)}
                      className="text-red-600 font-bold hover:text-red-800">Delete</button>
                    <button onClick={() => setConfirmDeleteId(null)}
                      className="text-slate-500 font-medium hover:text-slate-700 ml-1">Cancel</button>
                  </div>
                )}
                <ServiceRow
                  key={svc.id}
                  service={svc}
                  isEditing={editingId === svc.id}
                  onEdit={id => { setEditingId(id); setAddingNew(false); }}
                  onCancelEdit={() => setEditingId(null)}
                  onSaveEdit={handleSaveEdit}
                  onDelete={handleDelete}
                  onToggleActive={handleToggleActive}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
