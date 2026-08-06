import React from 'react';
import { Sparkles } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-slate-950 text-slate-400 py-12 border-t border-slate-900 px-6 mt-auto">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between space-y-6 md:space-y-0">
        <div className="flex items-center space-x-3">
          <div className="bg-indigo-600 p-2 rounded-lg text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="font-display font-bold text-lg text-white">LeadFlow</span>
        </div>

        <div className="flex space-x-8 text-sm font-semibold">
          <a href="#features" className="hover:text-white transition">Features</a>
          <a href="#benefits" className="hover:text-white transition">Benefits</a>
          <a href="#pricing" className="hover:text-white transition">Pricing</a>
          <a href="#faq" className="hover:text-white transition">FAQ</a>
        </div>

        <div className="text-xs text-slate-500 font-medium">
          &copy; {new Date().getFullYear()} LeadFlow Technologies Inc. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
