import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bot, Check, Plus, Trash2, Pencil, X, MessageSquare,
  Mic, Mail, MapPin, Zap, HelpCircle, Info
} from 'lucide-react';
import { AIReceptionistConfig, FaqItem } from '../../types';
import { aiConfigService } from '../../services/business/aiConfigService';

const INPUT = 'w-full px-3.5 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-xs bg-slate-50/50 text-slate-800';
const LABEL = 'text-xs font-semibold text-slate-500 uppercase tracking-wider';

// ─── Reusable toggle ──────────────────────────────────────────────────────────
function Toggle({
  id, checked, onChange, label, description, accent = 'indigo'
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  accent?: 'indigo' | 'red' | 'amber';
}) {
  const track = checked
    ? accent === 'red' ? 'bg-red-500' : accent === 'amber' ? 'bg-amber-500' : 'bg-indigo-600'
    : 'bg-slate-200';

  return (
    <div className={`flex items-start justify-between p-4 rounded-xl border transition ${
      checked
        ? accent === 'red' ? 'border-red-200 bg-red-50' : accent === 'amber' ? 'border-amber-200 bg-amber-50' : 'border-indigo-200 bg-indigo-50'
        : 'border-slate-200 bg-slate-50'
    }`}>
      <div className="space-y-0.5 pr-4 flex-1">
        <p className="text-xs font-bold text-slate-800">{label}</p>
        {description && <p className="text-[11px] text-slate-500 leading-normal">{description}</p>}
      </div>
      <label htmlFor={id} className="flex-shrink-0 cursor-pointer select-none pt-0.5">
        <div className="relative">
          <input id={id} type="checkbox" className="sr-only"
            checked={checked} onChange={e => onChange(e.target.checked)} />
          <div className={`w-9 h-5 rounded-full transition-colors ${track}`} />
          <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
        </div>
      </label>
    </div>
  );
}

// ─── FAQ row ──────────────────────────────────────────────────────────────────
interface FaqRowProps {
  faq: FaqItem;
  onDelete: (id: string) => void;
  onSave: (id: string, q: string, a: string) => void;
  key?: React.Key;
}

function FaqRow({ faq, onDelete, onSave }: FaqRowProps) {
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState(faq.question);
  const [a, setA] = useState(faq.answer);

  function handleSave() {
    if (!q.trim() || !a.trim()) return;
    onSave(faq.id, q.trim(), a.trim());
    setEditing(false);
  }

  function handleCancel() {
    setQ(faq.question);
    setA(faq.answer);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="border border-indigo-200 bg-indigo-50/40 rounded-xl p-4 space-y-3">
        <div className="space-y-1.5">
          <label className={LABEL}>Question</label>
          <input type="text" value={q} onChange={e => setQ(e.target.value)}
            className={INPUT} placeholder="e.g. What areas do you serve?" />
        </div>
        <div className="space-y-1.5">
          <label className={LABEL}>Answer</label>
          <textarea rows={2} value={a} onChange={e => setA(e.target.value)}
            className={`${INPUT} resize-none`} placeholder="The AI will use this answer when asked." />
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={handleSave}
            className="inline-flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg transition">
            <Check className="h-3.5 w-3.5" /><span>Save</span>
          </button>
          <button onClick={handleCancel}
            className="text-xs font-medium text-slate-500 hover:text-slate-700 border border-slate-200 px-3.5 py-2 rounded-lg transition">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-slate-200 bg-white rounded-xl p-4 flex items-start justify-between gap-4 hover:border-slate-300 transition">
      <div className="flex-1 min-w-0 space-y-1 text-left">
        <p className="text-xs font-bold text-slate-800 truncate">{faq.question}</p>
        <p className="text-[11px] text-slate-500 leading-normal line-clamp-2">{faq.answer}</p>
      </div>
      <div className="flex items-center space-x-1 flex-shrink-0">
        <button onClick={() => setEditing(true)}
          className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 transition"
          aria-label="Edit FAQ">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => onDelete(faq.id)}
          className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition"
          aria-label="Delete FAQ">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

/**
 * AIReceptionistTab
 *
 * Configures how the AI chat widget behaves. All changes persist immediately
 * to businessSettings. The conversation engine reads these settings live on
 * every step — no restart or page reload required.
 *
 * What each setting controls:
 * - welcomeMessage  → first message the AI sends (chatApi.getGreeting)
 * - tone            → formal vs casual phrasing in step prompts
 * - collectEmail    → whether the email step is included in the flow
 * - collectAddress  → shown as placeholder; address collection via conversation not yet wired
 * - enableEmergencyWorkflow → whether the emergency step is included in the flow
 * - faq             → Q&A the AI can reference (future: OpenAI function calling)
 */
export function AIReceptionistTab() {
  const [config, setConfig] = useState<AIReceptionistConfig>(aiConfigService.defaults());
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  // FAQ add form state
  const [addingFaq, setAddingFaq] = useState(false);
  const [newQ, setNewQ] = useState('');
  const [newA, setNewA] = useState('');

  useEffect(() => {
    setConfig(aiConfigService.load());
  }, []);

  function patch(updates: Partial<AIReceptionistConfig>) {
    const updated = { ...config, ...updates };
    setConfig(updated);
    setDirty(true);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    aiConfigService.save(config);
    setSaved(true);
    setDirty(false);
    setTimeout(() => setSaved(false), 4000);
  }

  // ── FAQ handlers ─────────────────────────────────────────────────────────
  function handleAddFaq(e: React.FormEvent) {
    e.preventDefault();
    if (!newQ.trim() || !newA.trim()) return;
    const updated = aiConfigService.addFaq(newQ, newA);
    setConfig(updated);
    setNewQ(''); setNewA('');
    setAddingFaq(false);
    flash();
  }

  function handleSaveFaq(id: string, q: string, a: string) {
    const updated = aiConfigService.updateFaq(id, { question: q, answer: a });
    setConfig(updated);
    flash();
  }

  function handleDeleteFaq(id: string) {
    const updated = aiConfigService.removeFaq(id);
    setConfig(updated);
    flash();
  }

  function flash() {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 text-left">

      {/* Saved banner */}
      <AnimatePresence>
        {saved && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg text-xs font-semibold flex items-center space-x-2">
            <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
            <span>AI Receptionist settings saved. The next conversation will use these settings.</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Welcome Message + Tone ───────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-5">
        <h3 className="font-display font-bold text-sm text-slate-950 flex items-center space-x-2 border-b border-slate-100 pb-3">
          <MessageSquare className="h-4.5 w-4.5 text-indigo-500" />
          <span>Personality</span>
        </h3>

        <div className="space-y-1.5">
          <label className={LABEL}>Welcome Message</label>
          <textarea
            rows={3}
            value={config.welcomeMessage}
            onChange={e => patch({ welcomeMessage: e.target.value })}
            placeholder="Hi there! I'm here to help schedule your HVAC service…"
            className={`${INPUT} resize-none`}
          />
          <p className="text-[10px] text-slate-400">
            This is the first message customers see when they open the chat widget.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className={LABEL}>Conversation Tone</label>
          <div className="grid grid-cols-3 gap-3">
            {(['Friendly', 'Professional', 'Casual'] as const).map(tone => (
              <button
                key={tone}
                type="button"
                onClick={() => patch({ tone })}
                className={`py-2.5 rounded-xl text-xs font-semibold border transition ${
                  config.tone === tone
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-100'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50'
                }`}
              >
                {tone === 'Friendly' && '😊 '}
                {tone === 'Professional' && '💼 '}
                {tone === 'Casual' && '👋 '}
                {tone}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-slate-400">
            Controls the phrasing of AI prompts throughout the conversation.
          </p>
        </div>
      </div>

      {/* ── Data Collection ──────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
        <h3 className="font-display font-bold text-sm text-slate-950 flex items-center space-x-2 border-b border-slate-100 pb-3">
          <Mic className="h-4.5 w-4.5 text-indigo-500" />
          <span>Data Collection</span>
        </h3>

        <Toggle
          id="collect-email"
          checked={config.collectEmail}
          onChange={v => patch({ collectEmail: v })}
          label="Collect Email Address"
          description="Adds an email step to the conversation. Customers can type 'skip' to bypass it."
        />

        <Toggle
          id="collect-address"
          checked={config.collectAddress}
          onChange={v => patch({ collectAddress: v })}
          label="Collect Street Address"
          description="Placeholder — address collection via conversation will be added in a future sprint."
          accent="amber"
        />

        <div className="flex items-start space-x-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-[11px] text-slate-500">
          <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-indigo-400" />
          <span>ZIP code and phone number are always collected — they are required for qualification.</span>
        </div>
      </div>

      {/* ── Emergency Workflow ───────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
        <h3 className="font-display font-bold text-sm text-slate-950 flex items-center space-x-2 border-b border-slate-100 pb-3">
          <Zap className="h-4.5 w-4.5 text-indigo-500" />
          <span>Emergency Workflow</span>
        </h3>

        <Toggle
          id="emergency-workflow"
          checked={config.enableEmergencyWorkflow}
          onChange={v => patch({ enableEmergencyWorkflow: v })}
          label="Enable Emergency Question"
          description='When on, the AI asks "Is this an emergency?" after the customer describes their service need. Emergency leads get High priority and faster routing.'
          accent="red"
        />
      </div>

      {/* ── Business FAQ ─────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="font-display font-bold text-sm text-slate-950 flex items-center space-x-2">
            <HelpCircle className="h-4.5 w-4.5 text-indigo-500" />
            <span>Business FAQs</span>
            <span className="text-[10px] font-normal text-slate-400">{config.faq.length} entries</span>
          </h3>
          {!addingFaq && (
            <button
              type="button"
              onClick={() => setAddingFaq(true)}
              className="inline-flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg transition shadow-sm shadow-indigo-100"
            >
              <Plus className="h-3.5 w-3.5" /><span>Add FAQ</span>
            </button>
          )}
        </div>

        <p className="text-[11px] text-slate-500 leading-normal">
          FAQs will be referenced by the AI when customers ask common questions. When connected to OpenAI in a future sprint, these will be injected as context.
        </p>

        {/* New FAQ form */}
        <AnimatePresence>
          {addingFaq && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <form onSubmit={handleAddFaq}
                className="border border-indigo-200 bg-indigo-50/40 rounded-xl p-4 space-y-3 mb-3">
                <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">New FAQ Entry</p>
                <div className="space-y-1.5">
                  <label className={LABEL}>Question</label>
                  <input required type="text" value={newQ} onChange={e => setNewQ(e.target.value)}
                    placeholder="e.g. What areas do you serve?" className={INPUT} />
                </div>
                <div className="space-y-1.5">
                  <label className={LABEL}>Answer</label>
                  <textarea required rows={2} value={newA} onChange={e => setNewA(e.target.value)}
                    placeholder="The AI will use this answer verbatim when asked."
                    className={`${INPUT} resize-none`} />
                </div>
                <div className="flex items-center space-x-2">
                  <button type="submit"
                    className="inline-flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg transition">
                    <Check className="h-3.5 w-3.5" /><span>Add FAQ</span>
                  </button>
                  <button type="button" onClick={() => { setAddingFaq(false); setNewQ(''); setNewA(''); }}
                    className="text-xs font-medium text-slate-500 hover:text-slate-700 border border-slate-200 px-3.5 py-2 rounded-lg transition">
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* FAQ list */}
        {config.faq.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
            No FAQ entries yet. Add common customer questions above.
          </div>
        ) : (
          <div className="space-y-3">
            {config.faq.map(f => (
              <FaqRow
                key={f.id}
                faq={f}
                onDelete={handleDeleteFaq}
                onSave={handleSaveFaq}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Save button ──────────────────────────────────────────────────── */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!dirty}
          className="inline-flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold text-sm px-6 py-3 rounded-lg transition shadow-md shadow-indigo-100"
        >
          <Check className="h-4 w-4" />
          <span>Save AI Settings</span>
        </button>
      </div>
    </form>
  );
}
