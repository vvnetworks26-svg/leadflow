import React from 'react';
import { Bell } from 'lucide-react';

export default function Notifications() {
  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h2 className="font-display font-extrabold text-2xl text-slate-900 tracking-tight">Notifications</h2>
        <p className="text-sm text-slate-500">Manage alert preferences for leads, appointments, and AI activity.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-12 shadow-sm text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center mx-auto">
          <Bell className="h-6 w-6 text-indigo-500" />
        </div>
        <p className="font-display font-bold text-slate-800">Notification Preferences</p>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          Granular notification controls for SMS, email, and in-app alerts are under development.
        </p>
      </div>
    </div>
  );
}
