import React from 'react';
import { Users } from 'lucide-react';

export default function Customers() {
  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h2 className="font-display font-extrabold text-2xl text-slate-900 tracking-tight">Customers</h2>
        <p className="text-sm text-slate-500">Full customer profiles, service history, and lifetime value tracking.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-12 shadow-sm text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center mx-auto">
          <Users className="h-6 w-6 text-indigo-500" />
        </div>
        <p className="font-display font-bold text-slate-800">Customer CRM</p>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          Unified customer records with appointment history, equipment details, and communication logs are under development.
        </p>
      </div>
    </div>
  );
}
