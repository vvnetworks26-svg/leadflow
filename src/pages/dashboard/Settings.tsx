import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Building2, Clock, MapPin, Wrench, Bot, Users, Bell,
  Plug, CreditCard, Check, Save, Plus, Trash2, X, AlertCircle
} from 'lucide-react';
import { BusinessSettings, BusinessHours, DaySchedule, ServiceItem,
  TeamMember, AIReceptionistConfig, FaqItem, NotificationPreferences } from '../../types';
import { businessSettings } from '../../services/business/businessSettings';

// ─── Tab config ───────────────────────────────────────────────────────────────
type TabId = 'profile' | 'hours' | 'areas' | 'services' | 'ai' | 'team' | 'notifications' | 'integrations' | 'billing';

interface Tab { id: TabId; label: string; icon: React.ReactNode; disabled?: boolean; badge?: string }

const TABS: Tab[] = [
  { id: 'profile',       label: 'Business Profile',  icon: <Building2 className="h-4 w-4" /> },
  { id: 'hours',         label: 'Business Hours',     icon: <Clock className="h-4 w-4" /> },
  { id: 'areas',         label: 'Service Areas',      icon: <MapPin className="h-4 w-4" /> },
  { id: 'services',      label: 'Services',           icon: <Wrench className="h-4 w-4" /> },
  { id: 'ai',            label: 'AI Receptionist',    icon: <Bot className="h-4 w-4" /> },
  { id: 'team',          label: 'Team',               icon: <Users className="h-4 w-4" /> },
  { id: 'notifications', label: 'Notifications',      icon: <Bell className="h-4 w-4" /> },
  { id: 'integrations',  label: 'Integrations',       icon: <Plug className="h-4 w-4" />, disabled: true, badge: 'Soon' },
  { id: 'billing',       label: 'Billing',            icon: <CreditCard className="h-4 w-4" />, disabled: true, badge: 'Soon' },
];

// ─── Shared atoms ─────────────────────────────────────────────────────────────
const INPUT = "w-full px-3.5 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-xs bg-slate-50/50 text-slate-800";
const LABEL = "text-xs font-semibold text-slate-500 uppercase tracking-wider";
const CARD  = "bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-5";

function CardHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h3 className="font-display font-bold text-sm text-slate-950 flex items-center space-x-2 border-b border-slate-100 pb-3">
      <span className="text-indigo-500">{icon}</span>
      <span>{title}</span>
    </h3>
  );
}

function SavedBanner({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ opacity:0, y:-12 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-12 }}
          className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-lg text-xs font-semibold flex items-center space-x-2">
          <Check className="h-4 w-4 text-emerald-600" />
          <span>Settings saved successfully.</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function makeId() { return `id_${Math.random().toString(36).substr(2,8)}`; }

// ─── Coming-soon placeholder ──────────────────────────────────────────────────
function ComingSoonTab({ label }: { label: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-12 shadow-sm text-center space-y-3">
      <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center mx-auto">
        <AlertCircle className="h-6 w-6 text-indigo-400" />
      </div>
      <p className="font-display font-bold text-slate-800">{label}</p>
      <p className="text-xs text-slate-400 max-w-xs mx-auto">
        This section is under development and will be available in a future sprint.
      </p>
    </div>
  );
}

// ─── Main Settings page ───────────────────────────────────────────────────────
import { BusinessProfileTab } from '../../components/Settings/BusinessProfileTab';
import { BusinessHoursTab } from '../../components/Settings/BusinessHoursTab';
import { ServiceAreaTab } from '../../components/Settings/ServiceAreaTab';
import { BusinessServicesTab } from '../../components/Settings/BusinessServicesTab';
import { AIReceptionistTab } from '../../components/Settings/AIReceptionistTab';

export default function Settings() {
  const [activeTab, setActiveTab] = useState<TabId>('profile');

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Page header */}
      <div>
        <h2 className="font-display font-extrabold text-2xl text-slate-900 tracking-tight">Settings</h2>
        <p className="text-sm text-slate-500 font-medium">
          Configure your business profile, hours, services, and AI receptionist behaviour.
        </p>
      </div>

      {/* Tab navigation — horizontal scroll on mobile */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto">
        <nav className="flex min-w-max" aria-label="Settings sections">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => !tab.disabled && setActiveTab(tab.id)}
              disabled={tab.disabled}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              className={`
                flex items-center space-x-2 px-4 py-3.5 text-xs font-semibold border-b-2 transition whitespace-nowrap
                ${tab.disabled
                  ? 'text-slate-300 border-transparent cursor-not-allowed'
                  : activeTab === tab.id
                    ? 'text-indigo-700 border-indigo-600 bg-indigo-50/50'
                    : 'text-slate-600 border-transparent hover:text-slate-800 hover:bg-slate-50'
                }
              `}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.badge && (
                <span className="bg-slate-100 text-slate-400 text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'profile'       && <BusinessProfileTab />}
        {activeTab === 'hours'         && <BusinessHoursTab />}
        {activeTab === 'areas'         && <ServiceAreaTab />}
        {activeTab === 'services'      && <BusinessServicesTab />}
        {activeTab === 'ai'            && <AIReceptionistTab />}
        {activeTab === 'team'          && <ComingSoonTab label="Team" />}
        {activeTab === 'notifications' && <ComingSoonTab label="Notifications" />}
        {activeTab === 'integrations'  && <ComingSoonTab label="Integrations" />}
        {activeTab === 'billing'       && <ComingSoonTab label="Billing" />}
      </div>
    </div>
  );
}
