import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, Check, AlertTriangle, Info, RotateCcw, Sun, Moon } from 'lucide-react';
import { BusinessHours, DaySchedule } from '../../types';
import {
  businessHoursService,
  DAY_KEYS, DAY_LABELS, DayKey,
  TIME_OPTIONS, formatTimeLabel
} from '../../services/business/businessHoursService';

const INPUT  = 'w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-xs bg-slate-50/50 text-slate-800';
const LABEL  = 'text-xs font-semibold text-slate-500 uppercase tracking-wider';

// ─── Toggle switch ────────────────────────────────────────────────────────────
function Toggle({
  checked, onChange, disabled, label, id
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
  id: string;
}) {
  return (
    <label htmlFor={id} className={`flex items-center space-x-2 cursor-pointer select-none ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      <div className="relative">
        <input id={id} type="checkbox" className="sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
        <div className={`w-9 h-5 rounded-full transition-colors ${checked ? 'bg-indigo-600' : 'bg-slate-200'}`} />
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </div>
      {label && <span className="text-xs font-medium text-slate-700">{label}</span>}
    </label>
  );
}

// ─── Single day row ───────────────────────────────────────────────────────────
function DayRow({
  dayKey, schedule, onChange
}: {
  dayKey: DayKey;
  schedule: DaySchedule;
  onChange: (key: DayKey, patch: Partial<DaySchedule>) => void;
  key?: React.Key;
}) {
  return (
    <div className={`grid grid-cols-12 gap-3 items-center py-3 border-b border-slate-100 last:border-0 ${!schedule.isOpen ? 'opacity-60' : ''}`}>
      {/* Day name */}
      <div className="col-span-3 sm:col-span-2">
        <span className="text-xs font-semibold text-slate-800">{DAY_LABELS[dayKey]}</span>
      </div>

      {/* Open toggle */}
      <div className="col-span-3 sm:col-span-2 flex items-center">
        <Toggle
          id={`toggle-${dayKey}`}
          checked={schedule.isOpen}
          onChange={v => onChange(dayKey, { isOpen: v })}
          label={schedule.isOpen ? 'Open' : 'Closed'}
        />
      </div>

      {/* Open time */}
      <div className="col-span-3 sm:col-span-4">
        <select
          value={schedule.openTime}
          disabled={!schedule.isOpen}
          onChange={e => onChange(dayKey, { openTime: e.target.value })}
          className={`${INPUT} disabled:opacity-40 disabled:cursor-not-allowed`}
          aria-label={`${DAY_LABELS[dayKey]} open time`}
        >
          {TIME_OPTIONS.map(t => (
            <option key={t} value={t}>{formatTimeLabel(t)}</option>
          ))}
        </select>
      </div>

      {/* Divider */}
      <div className="col-span-1 text-center text-xs text-slate-400 font-medium hidden sm:block">to</div>

      {/* Close time */}
      <div className="col-span-3 sm:col-span-3">
        <select
          value={schedule.closeTime}
          disabled={!schedule.isOpen}
          onChange={e => onChange(dayKey, { closeTime: e.target.value })}
          className={`${INPUT} disabled:opacity-40 disabled:cursor-not-allowed`}
          aria-label={`${DAY_LABELS[dayKey]} close time`}
        >
          {TIME_OPTIONS.map(t => (
            <option key={t} value={t}>{formatTimeLabel(t)}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ─── Main tab component ───────────────────────────────────────────────────────

/**
 * BusinessHoursTab
 *
 * Editable weekly schedule. Changes are saved to businessHoursService,
 * which persists to localStorage. The calendarService reads those settings
 * live on the next getAvailableSlots() call — no page reload needed.
 */
export function BusinessHoursTab() {
  const [hours, setHours] = useState<BusinessHours>(businessHoursService.defaults());
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => {
    setHours(businessHoursService.load());
  }, []);

  function patch(updates: Partial<BusinessHours>) {
    setHours(prev => ({ ...prev, ...updates }));
    setDirty(true);
  }

  function handleDayChange(key: DayKey, dayPatch: Partial<DaySchedule>) {
    setHours(prev => ({
      ...prev,
      [key]: { ...prev[key], ...dayPatch }
    }));
    setDirty(true);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    businessHoursService.save(hours);
    setSaved(true);
    setDirty(false);
    setTimeout(() => setSaved(false), 4000);
  }

  function handleReset() {
    const defaults = businessHoursService.defaults();
    setHours(defaults);
    businessHoursService.save(defaults);
    setShowResetConfirm(false);
    setSaved(true);
    setDirty(false);
    setTimeout(() => setSaved(false), 4000);
  }

  function applyWeekdayPreset() {
    // Copy Monday's hours to Tue–Fri
    const mon = hours.monday;
    const updated = { ...hours };
    (['tuesday', 'wednesday', 'thursday', 'friday'] as DayKey[]).forEach(d => {
      updated[d] = { ...updated[d], isOpen: mon.isOpen, openTime: mon.openTime, closeTime: mon.closeTime };
    });
    setHours(updated);
    setDirty(true);
  }

  const openDays = DAY_KEYS.filter(d => hours[d].isOpen).length;

  return (
    <form onSubmit={handleSave} className="space-y-6 text-left">

      {/* Save banner */}
      <AnimatePresence>
        {saved && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg text-xs font-semibold flex items-center space-x-2">
            <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
            <span>Business hours saved. New appointment slots reflect these changes immediately.</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Vacation mode banner */}
      <AnimatePresence>
        {hours.vacationMode && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-xs font-semibold flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>Vacation mode is ON — the AI chat will not offer any appointment slots.</span>
            </div>
            <button type="button" onClick={() => patch({ vacationMode: false })}
              className="text-amber-700 hover:text-amber-900 font-bold underline ml-4 flex-shrink-0">
              Turn off
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Global toggles ──────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-5">
        <h3 className="font-display font-bold text-sm text-slate-950 flex items-center space-x-2 border-b border-slate-100 pb-3">
          <Clock className="h-4.5 w-4.5 text-indigo-500" />
          <span>Availability Mode</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Vacation mode */}
          <div className={`flex items-start space-x-3 p-4 rounded-xl border transition ${hours.vacationMode ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
            <Sun className={`h-4 w-4 mt-0.5 flex-shrink-0 ${hours.vacationMode ? 'text-amber-500' : 'text-slate-400'}`} />
            <div className="flex-1 space-y-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">Vacation Mode</span>
                <Toggle
                  id="vacation-mode"
                  checked={hours.vacationMode}
                  onChange={v => patch({ vacationMode: v })}
                />
              </div>
              <p className="text-[11px] text-slate-500 leading-normal">
                Blocks all new booking slots. Emergency contacts are still shown.
              </p>
            </div>
          </div>

          {/* Emergency after hours */}
          <div className={`flex items-start space-x-3 p-4 rounded-xl border transition ${hours.emergencyAfterHours ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50'}`}>
            <Moon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${hours.emergencyAfterHours ? 'text-red-500' : 'text-slate-400'}`} />
            <div className="flex-1 space-y-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">Emergency After-Hours</span>
                <Toggle
                  id="emergency-after-hours"
                  checked={hours.emergencyAfterHours}
                  onChange={v => patch({ emergencyAfterHours: v })}
                />
              </div>
              <p className="text-[11px] text-slate-500 leading-normal">
                Allows emergency dispatch requests outside regular hours.
              </p>
            </div>
          </div>
        </div>

        {/* Holiday placeholder */}
        <div className="flex items-start space-x-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-[11px] text-slate-500">
          <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-indigo-400" />
          <span>Holiday date blocking will be available in a future update. Use Vacation Mode to close for specific periods.</span>
        </div>
      </div>

      {/* ── Weekly schedule ─────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="font-display font-bold text-sm text-slate-950 flex items-center space-x-2">
            <Clock className="h-4.5 w-4.5 text-indigo-500" />
            <span>Weekly Schedule</span>
            <span className="text-[10px] font-normal text-slate-400 ml-1">
              {openDays} day{openDays !== 1 ? 's' : ''} open
            </span>
          </h3>
          <button
            type="button"
            onClick={applyWeekdayPreset}
            title="Copy Monday's hours to Tuesday–Friday"
            className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold border border-indigo-200 hover:border-indigo-400 px-2.5 py-1 rounded-lg transition"
          >
            Copy Mon → Tue–Fri
          </button>
        </div>

        {/* Column headings */}
        <div className="grid grid-cols-12 gap-3 px-0">
          <div className="col-span-3 sm:col-span-2">
            <span className={`${LABEL} text-[10px]`}>Day</span>
          </div>
          <div className="col-span-3 sm:col-span-2">
            <span className={`${LABEL} text-[10px]`}>Status</span>
          </div>
          <div className="col-span-3 sm:col-span-4">
            <span className={`${LABEL} text-[10px]`}>Opens</span>
          </div>
          <div className="col-span-1 hidden sm:block" />
          <div className="col-span-3 sm:col-span-3">
            <span className={`${LABEL} text-[10px]`}>Closes</span>
          </div>
        </div>

        {DAY_KEYS.map(key => (
          <DayRow
            key={key}
            dayKey={key}
            schedule={hours[key]}
            onChange={handleDayChange}
          />
        ))}
      </div>

      {/* ── Footer actions ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        {/* Reset to defaults */}
        <div>
          {!showResetConfirm ? (
            <button type="button" onClick={() => setShowResetConfirm(true)}
              className="inline-flex items-center space-x-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300 px-3.5 py-2.5 rounded-lg transition">
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset to defaults</span>
            </button>
          ) : (
            <div className="flex items-center space-x-2">
              <span className="text-xs text-slate-600 font-medium">Reset all hours?</span>
              <button type="button" onClick={handleReset}
                className="text-xs font-bold text-red-600 hover:text-red-800 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition">
                Yes, reset
              </button>
              <button type="button" onClick={() => setShowResetConfirm(false)}
                className="text-xs font-medium text-slate-500 hover:text-slate-700 border border-slate-200 px-3 py-1.5 rounded-lg transition">
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Save */}
        <button
          type="submit"
          disabled={!dirty}
          className="inline-flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold text-sm px-6 py-3 rounded-lg transition shadow-md shadow-indigo-100"
        >
          <Check className="h-4 w-4" />
          <span>Save Hours</span>
        </button>
      </div>
    </form>
  );
}
