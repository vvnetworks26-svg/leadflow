import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Building2, User, Mail, Phone, Globe, MapPin, Clock, FileText, Check, Upload, ImageOff } from 'lucide-react';
import { BusinessProfile } from '../../types';
import { businessProfileService } from '../../services/business/businessProfileService';

// ─── Shared style constants (match existing design system) ─────────────────────
const INPUT = 'w-full px-3.5 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-xs bg-slate-50/50 text-slate-800';
const LABEL = 'text-xs font-semibold text-slate-500 uppercase tracking-wider';

const US_TIMEZONES = [
  'EST — Eastern (UTC−5)', 'CST — Central (UTC−6)',
  'MST — Mountain (UTC−7)', 'PST — Pacific (UTC−8)',
  'AKST — Alaska (UTC−9)', 'HST — Hawaii (UTC−10)'
];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY'
];

const INDUSTRIES = ['HVAC', 'Plumbing', 'Electrical', 'General Contractor', 'Roofing', 'Other'];

/**
 * BusinessProfileTab
 *
 * Renders and manages the Business Profile form.
 * Loads from businessProfileService on mount, saves on submit.
 * Fully self-contained — no props required from the parent Settings page.
 */
export function BusinessProfileTab() {
  const [form, setForm] = useState<BusinessProfile>(businessProfileService.defaults());
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load persisted profile on mount
  useEffect(() => {
    setForm(businessProfileService.load());
  }, []);

  function set(patch: Partial<BusinessProfile>) {
    setForm(prev => ({ ...prev, ...patch }));
    setDirty(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    businessProfileService.save(form);
    setSaved(true);
    setDirty(false);
    setTimeout(() => setSaved(false), 4000);
  }

  /** Convert a picked file to a base64 data-URL for logo preview. */
  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => set({ logoUrl: (ev.target?.result as string) ?? '' });
    reader.readAsDataURL(file);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 text-left">

      {/* Save banner */}
      <AnimatePresence>
        {saved && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg text-xs font-semibold flex items-center space-x-2">
            <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
            <span>Business profile saved successfully.</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Logo + Company Name ─────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-5">
        <h3 className="font-display font-bold text-sm text-slate-950 flex items-center space-x-2 border-b border-slate-100 pb-3">
          <Building2 className="h-4.5 w-4.5 text-indigo-500" />
          <span>Company Identity</span>
        </h3>

        <div className="flex items-start space-x-5">
          {/* Logo preview */}
          <div className="flex-shrink-0 flex flex-col items-center space-y-2">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-200 hover:border-indigo-400 bg-slate-50 flex items-center justify-center cursor-pointer transition overflow-hidden group"
              title="Upload company logo"
            >
              {form.logoUrl ? (
                <img src={form.logoUrl} alt="Company logo" className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center space-y-1 text-slate-400 group-hover:text-indigo-400 transition">
                  <Upload className="h-5 w-5" />
                  <span className="text-[9px] font-semibold">Upload</span>
                </div>
              )}
            </div>
            {form.logoUrl && (
              <button type="button" onClick={() => set({ logoUrl: '' })}
                className="text-[10px] text-red-500 hover:text-red-700 font-semibold transition">
                Remove
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoChange} className="hidden" aria-label="Upload company logo" />
            <p className="text-[9px] text-slate-400 text-center leading-tight max-w-[80px]">PNG · JPG · SVG</p>
          </div>

          {/* Company name + Industry */}
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <label className={LABEL}>Company Name *</label>
              <input required type="text" value={form.companyName}
                onChange={e => set({ companyName: e.target.value })}
                placeholder="Miller Climate Control LLC" className={INPUT} />
            </div>
            <div className="space-y-1.5">
              <label className={LABEL}>Industry</label>
              <select value={form.industry} onChange={e => set({ industry: e.target.value })} className={INPUT}>
                {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={LABEL}>Website</label>
              <input type="url" value={form.website}
                onChange={e => set({ website: e.target.value })}
                placeholder="https://your-company.com" className={INPUT} />
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label className={LABEL}>Company Description</label>
          <textarea rows={3} value={form.description}
            onChange={e => set({ description: e.target.value })}
            placeholder="Briefly describe your business, specialisations, and service area…"
            className={`${INPUT} resize-none`} />
        </div>
      </div>

      {/* ── Owner / Contact ─────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-5">
        <h3 className="font-display font-bold text-sm text-slate-950 flex items-center space-x-2 border-b border-slate-100 pb-3">
          <User className="h-4.5 w-4.5 text-indigo-500" />
          <span>Owner & Contact</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <label className={LABEL}>Owner Name *</label>
            <input required type="text" value={form.ownerName}
              onChange={e => set({ ownerName: e.target.value })}
              placeholder="John Miller" className={INPUT} />
          </div>
          <div className="space-y-1.5">
            <label className={LABEL}>Business Email *</label>
            <input required type="email" value={form.email}
              onChange={e => set({ email: e.target.value })}
              placeholder="owner@company.com" className={INPUT} />
          </div>
          <div className="space-y-1.5">
            <label className={LABEL}>Phone Number *</label>
            <input required type="tel" value={form.phone}
              onChange={e => set({ phone: e.target.value })}
              placeholder="(555) 000-0000" className={INPUT} />
          </div>
          <div className="space-y-1.5">
            <label className={LABEL}>Time Zone</label>
            <select value={form.timezone} onChange={e => set({ timezone: e.target.value })} className={INPUT}>
              {US_TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Business Address ────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-5">
        <h3 className="font-display font-bold text-sm text-slate-950 flex items-center space-x-2 border-b border-slate-100 pb-3">
          <MapPin className="h-4.5 w-4.5 text-indigo-500" />
          <span>Business Address</span>
        </h3>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className={LABEL}>Street Address</label>
            <input type="text" value={form.address}
              onChange={e => set({ address: e.target.value })}
              placeholder="1428 Commerce Drive" className={INPUT} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5 sm:col-span-1">
              <label className={LABEL}>City</label>
              <input type="text" value={form.city}
                onChange={e => set({ city: e.target.value })}
                placeholder="Atlanta" className={INPUT} />
            </div>
            <div className="space-y-1.5">
              <label className={LABEL}>State</label>
              <select value={form.state} onChange={e => set({ state: e.target.value })} className={INPUT}>
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={LABEL}>ZIP Code</label>
              <input type="text" value={form.zipCode}
                onChange={e => set({ zipCode: e.target.value })}
                placeholder="30308" maxLength={5} className={INPUT} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Save button ─────────────────────────────────────────────────── */}
      <div className="flex justify-end">
        <button type="submit"
          className="inline-flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm px-6 py-3 rounded-lg transition shadow-md shadow-indigo-100 disabled:bg-indigo-300"
          disabled={!dirty && !saved}>
          <Check className="h-4 w-4" />
          <span>{saved ? 'Saved!' : 'Save Profile'}</span>
        </button>
      </div>
    </form>
  );
}
