import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, Plus, X, Search, Check, AlertCircle, ToggleLeft, ToggleRight } from 'lucide-react';
import { serviceAreaService, isValidZip, ServiceAreaConfig } from '../../services/business/serviceAreaService';

const INPUT = 'w-full px-3.5 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-xs bg-slate-50/50 text-slate-800';

// ─── Shared toggle ────────────────────────────────────────────────────────────
function Toggle({ id, checked, onChange }: { id: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex items-center space-x-2 cursor-pointer select-none">
      <div className="relative">
        <input id={id} type="checkbox" className="sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
        <div className={`w-9 h-5 rounded-full transition-colors ${checked ? 'bg-indigo-600' : 'bg-slate-200'}`} />
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </div>
    </label>
  );
}

/**
 * ServiceAreaTab
 *
 * Lets the business owner add/remove ZIP codes and toggle service area
 * validation. Changes persist immediately — the qualification engine
 * reads businessSettings live on the next lead qualification call.
 */
export function ServiceAreaTab() {
  const [config, setConfig] = useState<ServiceAreaConfig>(serviceAreaService.defaults());
  const [search, setSearch] = useState('');
  const [newZip, setNewZip] = useState('');
  const [zipError, setZipError] = useState('');
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setConfig(serviceAreaService.load());
  }, []);

  // ── Filtered view ─────────────────────────────────────────────────
  const filteredZips = config.zips.filter(z => z.includes(search.trim()));

  // ── Add ZIP ───────────────────────────────────────────────────────
  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newZip.trim();
    if (!isValidZip(trimmed)) {
      setZipError('Enter a valid 5-digit ZIP code.');
      return;
    }
    if (config.zips.includes(trimmed)) {
      setZipError('That ZIP code is already in the list.');
      return;
    }
    const updated = serviceAreaService.addZip(trimmed);
    setConfig(updated);
    setNewZip('');
    setZipError('');
    flash();
    inputRef.current?.focus();
  }

  // ── Remove ZIP ────────────────────────────────────────────────────
  function handleRemove(zip: string) {
    const updated = serviceAreaService.removeZip(zip);
    setConfig(updated);
    flash();
  }

  // ── Toggle enabled ────────────────────────────────────────────────
  function handleToggleEnabled(v: boolean) {
    const updated = serviceAreaService.setEnabled(v);
    setConfig(updated);
    flash();
  }

  function flash() {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="space-y-6 text-left">

      {/* Save banner */}
      <AnimatePresence>
        {saved && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg text-xs font-semibold flex items-center space-x-2">
            <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
            <span>Service area saved. Lead qualification reflects these changes immediately.</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Enable / Disable card ─────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
        <h3 className="font-display font-bold text-sm text-slate-950 flex items-center space-x-2 border-b border-slate-100 pb-3">
          <MapPin className="h-4.5 w-4.5 text-indigo-500" />
          <span>Service Area Validation</span>
        </h3>

        <div className={`flex items-start justify-between p-4 rounded-xl border transition ${config.enabled ? 'border-indigo-200 bg-indigo-50' : 'border-slate-200 bg-slate-50'}`}>
          <div className="space-y-1 pr-4">
            <p className="text-xs font-bold text-slate-800">
              {config.enabled ? 'Validation enabled' : 'Validation disabled'}
            </p>
            <p className="text-[11px] text-slate-500 leading-normal max-w-sm">
              {config.enabled
                ? 'Leads are only qualified if their ZIP code is in the list below. Leads outside the area are marked Unqualified.'
                : 'All ZIP codes are accepted. Leads are qualified regardless of location.'}
            </p>
          </div>
          <div className="flex-shrink-0 pt-0.5">
            <Toggle id="area-enabled" checked={config.enabled} onChange={handleToggleEnabled} />
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-left">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Total ZIP codes</p>
            <p className="font-display text-xl font-bold text-slate-900 mt-0.5">{config.zips.length}</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-left">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Validation</p>
            <p className={`text-xs font-bold mt-1 ${config.enabled ? 'text-indigo-700' : 'text-slate-500'}`}>
              {config.enabled ? 'Active' : 'Off'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Add + Search card ─────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
        <h3 className="font-display font-bold text-sm text-slate-950 flex items-center space-x-2 border-b border-slate-100 pb-3">
          <MapPin className="h-4.5 w-4.5 text-indigo-500" />
          <span>ZIP Code List</span>
          <span className="text-[10px] font-normal text-slate-400">{config.zips.length} codes</span>
        </h3>

        {/* Add new ZIP */}
        <form onSubmit={handleAdd} className="flex items-start space-x-2">
          <div className="flex-1 space-y-1">
            <input
              ref={inputRef}
              type="text"
              value={newZip}
              onChange={e => { setNewZip(e.target.value); setZipError(''); }}
              placeholder="Enter 5-digit ZIP code…"
              maxLength={5}
              className={`${INPUT} ${zipError ? 'border-red-400 focus:border-red-400 focus:ring-red-400' : ''}`}
              aria-label="New ZIP code"
            />
            {zipError && (
              <p className="text-[10px] text-red-600 font-medium flex items-center space-x-1">
                <AlertCircle className="h-3 w-3" />
                <span>{zipError}</span>
              </p>
            )}
          </div>
          <button
            type="submit"
            className="inline-flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition shadow-sm shadow-indigo-100 flex-shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add</span>
          </button>
        </form>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search ZIP codes…"
            className="w-full pl-8 pr-4 py-2 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-xs bg-slate-50/50 text-slate-800"
            aria-label="Search ZIP codes"
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* ZIP grid */}
        {config.zips.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
            No ZIP codes added yet. Add one above to start defining your service area.
          </div>
        ) : filteredZips.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400">
            No ZIP codes match "{search}".
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 max-h-72 overflow-y-auto pr-1">
            <AnimatePresence>
              {filteredZips.map(zip => (
                <motion.div
                  key={zip}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.12 }}
                  className="inline-flex items-center space-x-1.5 bg-indigo-50 border border-indigo-100 text-indigo-800 text-xs font-semibold px-2.5 py-1.5 rounded-lg"
                >
                  <span className="font-mono">{zip}</span>
                  <button
                    type="button"
                    onClick={() => handleRemove(zip)}
                    className="text-indigo-400 hover:text-red-500 transition"
                    aria-label={`Remove ZIP code ${zip}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {search && filteredZips.length > 0 && (
          <p className="text-[10px] text-slate-400">
            Showing {filteredZips.length} of {config.zips.length} ZIP codes
          </p>
        )}
      </div>
    </div>
  );
}
