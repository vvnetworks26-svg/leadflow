import React from 'react';
import { BarChart3, AlertCircle } from 'lucide-react';

export default function Analytics() {
  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h2 className="font-display font-extrabold text-2xl text-slate-900 tracking-tight">Analytics</h2>
        <p className="text-sm text-slate-500">Performance metrics, conversion funnels, and AI conversation insights.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-12 shadow-sm text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center mx-auto">
          <BarChart3 className="h-6 w-6 text-indigo-500" />
        </div>
        <p className="font-display font-bold text-slate-800">Analytics Dashboard</p>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          Detailed analytics reporting is under active development. Lead funnel metrics, booking conversion rates, and AI performance scores will appear here.
        </p>
      </div>
    </div>
  );
}
