import React from 'react';
import {
  Bot,
  Calendar,
  CheckCircle,
  Play,
  Sparkles,
} from 'lucide-react';
import { getDashboardUrl } from '@leadflow/shared';

export default function Hero() {
  const dashboardUrl = getDashboardUrl();

  return (
    <section className="relative pt-20 pb-24 px-6 overflow-hidden">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        <div className="lg:col-span-7 space-y-8 animate-slide-up">
          <div className="inline-flex items-center space-x-2 bg-indigo-50 text-indigo-700 px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wide">
            <Bot className="h-3.5 w-3.5" />
            <span>AI Lead Capture for HVAC Contractor Growth</span>
          </div>

          <h1 className="font-display font-extrabold text-4xl sm:text-5xl md:text-6xl text-slate-900 tracking-tight leading-[1.1]">
            Never Miss Another <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-indigo-700 to-indigo-400">Midnight AC Repair Call</span>
          </h1>

          <p className="text-lg text-slate-600 leading-relaxed max-w-xl font-medium">
            LeadFlow automatically captures warm HVAC leads, answers system questions, and books dispatch-ready appointments 24/7. Built specifically for residential air, heating, and plumbing contractors.
          </p>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
            <a
              href={`${dashboardUrl}/sign-up`}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-8 py-4 rounded-lg text-center shadow-lg shadow-indigo-100 hover:shadow-xl transition animate-pulse-slow"
            >
              Start 14-Day Free Trial
            </a>
            <button
              onClick={() => {
                // The ChatWidget FAB at the bottom-right opens the AI chat
                document.querySelector<HTMLButtonElement>('[aria-label="Open chat assistant"]')?.click();
              }}
              className="inline-flex items-center justify-center space-x-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold px-6 py-4 rounded-lg transition shadow-sm"
            >
              <Play className="h-4 w-4 fill-current text-indigo-500" />
              <span>Test Live Chat Widget</span>
            </button>
          </div>

          {/* Trust Metrics */}
          <div className="pt-6 border-t border-slate-200 grid grid-cols-3 gap-6">
            <div>
              <p className="font-display text-2xl font-bold text-slate-900">41%</p>
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Lead Capture Increase</p>
            </div>
            <div>
              <p className="font-display text-2xl font-bold text-slate-900">24/7/365</p>
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">No Sleep Triage</p>
            </div>
            <div>
              <p className="font-display text-2xl font-bold text-slate-900">ServiceTitan</p>
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Ready Integrations</p>
            </div>
          </div>
        </div>

        {/* Interactive visual device mockup */}
        <div className="lg:col-span-5 relative">
          <div className="absolute -inset-4 bg-indigo-200 rounded-3xl blur-3xl opacity-30 -z-10 animate-pulse-slow"></div>

          <div className="bg-white border border-slate-200 rounded-xl shadow-2xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center space-x-3">
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
                <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">DISPATCH ALIGNMENT ACTIVE</span>
              </div>
              <Sparkles className="h-4 w-4 text-indigo-500 animate-spin-slow" />
            </div>

            {/* Chat flow demonstration */}
            <div className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-lg space-y-1">
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">LeadFlow Bot</span>
                <p className="text-sm text-slate-700 font-semibold leading-relaxed">Hello, I see your furnace is blowing cold air. I can schedule a senior diagnostic technician to visit tomorrow at 9:00 AM or 1:00 PM. Which works best?</p>
              </div>

              <div className="bg-indigo-600 p-4 rounded-lg text-white space-y-1 max-w-[85%] ml-auto shadow-md shadow-indigo-100">
                <span className="text-[10px] font-bold text-indigo-100 uppercase tracking-wider">Homeowner (Sarah)</span>
                <p className="text-sm font-semibold leading-relaxed">Tomorrow 9:00 AM is perfect. AC went out last night, it is baking inside!</p>
              </div>

              <div className="bg-slate-50 p-4 rounded-lg space-y-1">
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Automated Dispatch</span>
                <p className="text-sm text-slate-800 font-bold flex items-center space-x-1.5 leading-relaxed">
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  <span>Booking scheduled for Monday, June 29 at 9:00 AM. Ticket sent to ServiceTitan.</span>
                </p>
              </div>
            </div>

            {/* Mock stat */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-150">
              <div className="bg-slate-50 p-3 rounded-lg text-center">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Lead Source</span>
                <span className="font-bold text-sm text-slate-800 block mt-0.5">HVAC Web Widget</span>
              </div>
              <div className="bg-emerald-50/50 p-3 rounded-lg text-center">
                <span className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider block">Est. Revenue</span>
                <span className="font-bold text-sm text-emerald-700 block mt-0.5">$350 - $6,500</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
