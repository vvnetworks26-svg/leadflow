import React from 'react';
import { 
  CreditCard, 
  Sparkles, 
  ShieldCheck, 
  HelpCircle, 
  TrendingUp, 
  ChevronRight, 
  ArrowUpRight, 
  Lock,
  Clock
} from 'lucide-react';

export default function Billing() {
  const mockInvoices = [
    { id: 'inv_91283', date: 'Jun 15, 2026', amount: '$299.00', status: 'Paid', method: 'Visa •••• 4242' },
    { id: 'inv_81273', date: 'May 15, 2026', amount: '$299.00', status: 'Paid', method: 'Visa •••• 4242' },
    { id: 'inv_71123', date: 'Apr 15, 2026', amount: '$299.00', status: 'Paid', method: 'Visa •••• 4242' },
  ];

  return (
    <div className="space-y-8 max-w-4xl mx-auto text-left animate-slide-up">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h2 className="font-display font-extrabold text-2xl text-slate-900 tracking-tight">Billing & Subscriptions</h2>
          <p className="text-sm text-slate-500 font-medium">Manage corporate licenses, truck dispatch counts, and QuickBooks connections.</p>
        </div>
        <div className="inline-flex items-center space-x-2 bg-indigo-50 text-indigo-800 border border-indigo-100 rounded-lg px-3 py-1.5 text-xs font-semibold">
          <Clock className="h-4 w-4 text-indigo-500" />
          <span>V3 Billing Engine Pending</span>
        </div>
      </div>

      {/* Under Construction Spotlight Card */}
      <div className="bg-gradient-to-tr from-slate-900 via-slate-950 to-indigo-950 text-white rounded-xl p-8 shadow-xl relative overflow-hidden space-y-6">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 bg-indigo-600 h-64 w-64 rounded-full blur-3xl opacity-35"></div>
        <div className="absolute left-1/3 bottom-0 translate-y-12 bg-indigo-600 h-48 w-48 rounded-full blur-3xl opacity-20"></div>

        <div className="space-y-4 relative z-10 max-w-xl">
          <span className="inline-flex items-center space-x-1.5 bg-indigo-500/20 text-indigo-300 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Billing Overhaul In Development</span>
          </span>
          <h3 className="font-display font-extrabold text-2xl sm:text-3xl leading-tight">
            Seamless Stripe and QuickBooks Integrations are Coming Soon
          </h3>
          <p className="text-xs text-indigo-200 leading-relaxed">
            We are restructuring our billing architecture. Very soon, you'll be able to link your QuickBooks Online accounts, pay technicians directly via Stripe instant transfers, and set multi-territory tax allocations right inside this tab.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-6 border-t border-indigo-800/60 relative z-10 text-xs">
          <div className="space-y-1">
            <span className="text-indigo-300 font-bold block uppercase tracking-wider text-[10px]">Upcoming Feature</span>
            <span className="font-semibold text-white block">Auto QuickBooks Sync</span>
            <span className="text-indigo-200">Map dispatch revenue directly to accounts.</span>
          </div>
          <div className="space-y-1">
            <span className="text-indigo-300 font-bold block uppercase tracking-wider text-[10px]">Upcoming Feature</span>
            <span className="font-semibold text-white block">Stripe Connect Pay</span>
            <span className="text-indigo-200">Settle invoices on-site immediately.</span>
          </div>
          <div className="space-y-1">
            <span className="text-indigo-300 font-bold block uppercase tracking-wider text-[10px]">Security Lock</span>
            <span className="font-semibold text-white block flex items-center space-x-1">
              <Lock className="h-3.5 w-3.5" />
              <span>PCI-DSS Level 1</span>
            </span>
            <span className="text-indigo-200">Encrypted banking parameters.</span>
          </div>
        </div>
      </div>

      {/* Subscription Tier Info */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm grid grid-cols-1 sm:grid-cols-12 gap-6">
        <div className="sm:col-span-8 space-y-4">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Workspace Plan</span>
          <div className="space-y-1">
            <h4 className="text-lg font-bold text-slate-900">Professional HVAC Plan (Trial Mode)</h4>
            <p className="text-xs text-slate-500">Includes unlimited AI chats, up to 15 dispatch trucks, and active ServiceTitan webhooks.</p>
          </div>
          <div className="flex items-center space-x-2 text-xs text-emerald-600 font-semibold bg-emerald-50 w-fit px-3 py-1 rounded-lg">
            <ShieldCheck className="h-4 w-4" />
            <span>Your sandbox active trial remains 100% Free</span>
          </div>
        </div>

        <div className="sm:col-span-4 border-t sm:border-t-0 sm:border-l border-slate-100 pt-6 sm:pt-0 sm:pl-6 flex flex-col justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Estimated Renewal</span>
            <p className="text-2xl font-bold font-display text-slate-950">$299.00 <span className="text-xs text-slate-400 font-medium">/mo</span></p>
            <p className="text-[10px] text-slate-400">Next cycle scheduled on July 12, 2026</p>
          </div>
          <button className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2.5 rounded-lg transition mt-4">
            Manage Subscription
          </button>
        </div>
      </div>

      {/* Mock Invoice History Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm space-y-4">
        <div className="p-6 pb-0">
          <h3 className="font-display font-semibold text-md text-slate-950">Invoice Statements History</h3>
          <p className="text-xs text-slate-400">Past licensing history and dispatch receipts.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Statement ID</th>
                <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Date Issued</th>
                <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Amount Paid</th>
                <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Payment Method</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {mockInvoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="px-6 py-4 font-mono font-medium text-slate-500">{inv.id}</td>
                  <td className="px-6 py-4 font-semibold text-slate-800">{inv.date}</td>
                  <td className="px-6 py-4 font-bold text-slate-950">{inv.amount}</td>
                  <td className="px-6 py-4">
                    <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-400 font-medium">{inv.method}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
