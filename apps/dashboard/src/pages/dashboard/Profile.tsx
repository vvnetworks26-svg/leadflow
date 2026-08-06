import React from 'react';
import { useUser } from '../../context/AuthContext';
import { UserCircle } from 'lucide-react';

export default function Profile() {
  const { user } = useUser();

  return (
    <div className="space-y-6 animate-slide-up max-w-2xl">
      <div>
        <h2 className="font-display font-extrabold text-2xl text-slate-900 tracking-tight">Profile</h2>
        <p className="text-sm text-slate-500">Manage your personal account details and preferences.</p>
      </div>

      {/* Current account summary */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex items-center space-x-4">
        <img
          src={user?.imageUrl ?? 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&h=80&fit=crop&crop=face'}
          alt={user?.firstName}
          className="h-16 w-16 rounded-full border border-slate-200 shadow-sm"
        />
        <div className="space-y-1 text-left">
          <p className="font-display font-bold text-lg text-slate-900">
            {user?.firstName} {user?.lastName}
          </p>
          <p className="text-sm text-slate-500">{user?.email}</p>
        </div>
      </div>

      {/* Placeholder content */}
      <div className="bg-white border border-slate-200 rounded-xl p-12 shadow-sm text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center mx-auto">
          <UserCircle className="h-6 w-6 text-indigo-500" />
        </div>
        <p className="font-display font-bold text-slate-800">Profile Editor</p>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          Full profile editing — name, avatar, password change, and two-factor authentication — is under development.
        </p>
      </div>
    </div>
  );
}
