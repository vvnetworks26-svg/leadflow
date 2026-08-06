import React from 'react';
import { CheckCircle } from 'lucide-react';

export default function Pricing() {
  const dashboardUrl = import.meta.env.VITE_DASHBOARD_URL ?? 'http://localhost:3000';

  return (
    <section id="pricing" className="py-24 bg-slate-50 border-b border-slate-100 px-6">
      <div className="max-w-7xl mx-auto space-y-16">
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <h2 className="font-display font-bold text-xs text-indigo-600 uppercase tracking-widest">Pricing</h2>
          <p className="font-display font-extrabold text-3xl sm:text-4xl text-slate-900 tracking-tight leading-tight">
            Flexible Plans Built for Growing Shops
          </p>
          <p className="text-slate-500 font-semibold">Every plan includes a 14-day free trial. No credit card required.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Tier 1 — Starter */}
          <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-6 flex flex-col justify-between shadow-sm">
            <div className="space-y-4">
              <span className="font-semibold text-xs text-slate-400 uppercase tracking-wider">Starter</span>
              <div className="flex items-baseline space-x-1">
                <span className="text-4xl font-bold font-display text-slate-900">$149</span>
                <span className="text-slate-400 text-sm font-medium">/month</span>
              </div>
              <p className="text-xs text-slate-500 font-semibold">Ideal for family-owned HVAC businesses with 1-3 service trucks.</p>
              <div className="border-t border-slate-100 my-4 pt-4 space-y-2.5">
                <div className="flex items-center space-x-2 text-xs text-slate-600">
                  <CheckCircle className="h-4 w-4 text-indigo-500" />
                  <span className="font-semibold">Up to 100 AI chats / month</span>
                </div>
                <div className="flex items-center space-x-2 text-xs text-slate-600">
                  <CheckCircle className="h-4 w-4 text-indigo-500" />
                  <span className="font-semibold">Dynamic Web Widget</span>
                </div>
                <div className="flex items-center space-x-2 text-xs text-slate-600">
                  <CheckCircle className="h-4 w-4 text-indigo-500" />
                  <span className="font-semibold">Google Calendar Sync</span>
                </div>
              </div>
            </div>
            <a
              href={`${dashboardUrl}/sign-up`}
              className="block text-center text-sm font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 py-3 rounded-lg transition mt-6"
            >
              Start Trial
            </a>
          </div>

          {/* Tier 2 — Professional */}
          <div className="bg-white border border-indigo-500 rounded-xl p-8 space-y-6 flex flex-col justify-between shadow-md relative ring-2 ring-indigo-600/10">
            <div className="absolute top-0 right-6 -translate-y-1/2 bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full">
              Most Popular
            </div>
            <div className="space-y-4">
              <span className="font-semibold text-xs text-indigo-600 uppercase tracking-wider">Professional</span>
              <div className="flex items-baseline space-x-1">
                <span className="text-4xl font-bold font-display text-slate-900">$299</span>
                <span className="text-slate-400 text-sm font-medium">/month</span>
              </div>
              <p className="text-xs text-slate-500 font-semibold">Built for expanding HVAC businesses running 4–15 dispatch vehicles.</p>
              <div className="border-t border-slate-100 my-4 pt-4 space-y-2.5">
                <div className="flex items-center space-x-2 text-xs text-slate-600">
                  <CheckCircle className="h-4 w-4 text-indigo-500" />
                  <span className="font-bold text-slate-900">Unlimited AI chats</span>
                </div>
                <div className="flex items-center space-x-2 text-xs text-slate-600">
                  <CheckCircle className="h-4 w-4 text-indigo-500" />
                  <span className="font-semibold">ServiceTitan / Housecall Pro Sync</span>
                </div>
                <div className="flex items-center space-x-2 text-xs text-slate-600">
                  <CheckCircle className="h-4 w-4 text-indigo-500" />
                  <span className="font-semibold">Smart SMS Phone Number Sync</span>
                </div>
                <div className="flex items-center space-x-2 text-xs text-slate-600">
                  <CheckCircle className="h-4 w-4 text-indigo-500" />
                  <span className="font-semibold">Priority replacement quote alerts</span>
                </div>
              </div>
            </div>
            <a
              href={`${dashboardUrl}/sign-up`}
              className="block text-center text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 py-3 rounded-lg transition shadow-md shadow-indigo-100 mt-6"
            >
              Start Trial
            </a>
          </div>

          {/* Tier 3 — Enterprise */}
          <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-6 flex flex-col justify-between shadow-sm">
            <div className="space-y-4">
              <span className="font-semibold text-xs text-slate-400 uppercase tracking-wider">Enterprise</span>
              <div className="flex items-baseline space-x-1">
                <span className="text-4xl font-bold font-display text-slate-900">$599</span>
                <span className="text-slate-400 text-sm font-medium">/month</span>
              </div>
              <p className="text-xs text-slate-500 font-semibold">Engineered for large multi-location operations with 15+ service trucks.</p>
              <div className="border-t border-slate-100 my-4 pt-4 space-y-2.5">
                <div className="flex items-center space-x-2 text-xs text-slate-600">
                  <CheckCircle className="h-4 w-4 text-indigo-500" />
                  <span className="font-semibold">Multi-location routing</span>
                </div>
                <div className="flex items-center space-x-2 text-xs text-slate-600">
                  <CheckCircle className="h-4 w-4 text-indigo-500" />
                  <span className="font-semibold">Custom LLM voice synthesis</span>
                </div>
                <div className="flex items-center space-x-2 text-xs text-slate-600">
                  <CheckCircle className="h-4 w-4 text-indigo-500" />
                  <span className="font-semibold">Dedicated Enterprise support rep</span>
                </div>
              </div>
            </div>
            <a
              href={`${dashboardUrl}/sign-up`}
              className="block text-center text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 py-3 rounded-lg transition mt-6"
            >
              Contact Sales
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
