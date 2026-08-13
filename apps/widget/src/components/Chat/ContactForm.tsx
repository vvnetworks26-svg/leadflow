import React, { useState } from 'react';
import { motion } from 'motion/react';
import { User, ArrowRight } from 'lucide-react';

interface Props {
  onSubmit: (name: string) => void;
}

/**
 * Inline name-collection form, shown only when the AI reaches the booking
 * step without ever having captured the visitor's name (the emergency-triage
 * blueprints gate booking on phone alone — see default-blueprints.ts).
 * Same labeled-input pattern as SignUp.tsx, scaled down for the chat window.
 */
export function ContactForm({ onSubmit }: Props) {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <motion.form
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      onSubmit={handleSubmit}
      className="w-full space-y-2 pt-0.5"
    >
      <div className="space-y-1.5">
        <label htmlFor="widget-visitor-name" className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
          Your Name
        </label>
        <div className="relative rounded-lg shadow-sm">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <User className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <input
            id="widget-visitor-name"
            type="text"
            autoComplete="name"
            required
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Jamie Rivera"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-[13px] bg-white text-slate-800"
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={!name.trim()}
        className="w-full flex justify-center items-center gap-1.5 py-2 px-3 rounded-lg text-[13px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition disabled:bg-slate-300 disabled:cursor-not-allowed"
      >
        <span>Continue</span>
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </motion.form>
  );
}
