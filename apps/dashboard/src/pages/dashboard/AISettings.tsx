import React from 'react';
import { Bot } from 'lucide-react';
import { AIReceptionistTab } from '../../components/Settings/AIReceptionistTab';

export default function AISettings() {
  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h2 className="font-display font-extrabold text-2xl text-slate-900 tracking-tight">AI Settings</h2>
        <p className="text-sm text-slate-500">Configure your AI receptionist's persona, tone, and conversation behaviour.</p>
      </div>

      <AIReceptionistTab />
    </div>
  );
}
