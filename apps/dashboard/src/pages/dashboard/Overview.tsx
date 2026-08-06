import React, { useState, useEffect } from 'react';
import { apiService } from '../../services/api';
import { Lead, Appointment, DashboardMetrics } from '../../types';
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Calendar, 
  Percent, 
  DollarSign, 
  Clock, 
  ArrowUpRight, 
  Sparkles,
  ChevronRight,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Overview() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [m, l, a] = await Promise.all([
          apiService.getMetrics(),
          apiService.getLeads(),
          apiService.getAppointments()
        ]);
        setMetrics(m);
        setLeads(l.slice(0, 4)); // Show recent 4 leads
        
        // Upcoming Scheduled appointments
        const upcoming = a
          .filter(appt => appt.status === 'Scheduled')
          .sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime())
          .slice(0, 4);
        setAppointments(upcoming);
      } catch (err) {
        console.error("Error loading Overview stats:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading || !metrics) {
    return (
      <div className="h-[70vh] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="text-sm text-slate-500 font-medium">Computing live HVAC business analytics...</p>
        </div>
      </div>
    );
  }

  // Format currency
  const formatUSD = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(val);
  };

  return (
    <div className="space-y-8 animate-slide-up">
      {/* Top Welcome Title Grid */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-extrabold text-2xl text-slate-900 tracking-tight">Active Operations Feed</h2>
          <p className="text-sm text-slate-500">Real-time dispatch, active lead captures, and revenue performance analytics.</p>
        </div>
        <div className="inline-flex items-center space-x-2 bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-lg px-3 py-1.5 text-xs font-semibold">
          <ShieldCheck className="h-4 w-4" />
          <span>Real-time Sync Active</span>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* KPI 1 - Total Leads */}
        <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm hover:shadow-none transition space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Leads</span>
            <div className="bg-indigo-50 p-2 rounded-lg text-indigo-600">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <div className="space-y-1">
            <p className="font-display text-2xl font-bold text-slate-900">{metrics.totalLeads}</p>
            <div className="flex items-center space-x-1.5 text-[11px] font-semibold text-emerald-600">
              <TrendingUp className="h-3.5 w-3.5" />
              <span>+{metrics.leadsChange}% from last month</span>
            </div>
          </div>
        </div>

        {/* KPI 2 - Today's Appointments */}
        <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm hover:shadow-none transition space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Today's Dispatches</span>
            <div className="bg-indigo-50 p-2 rounded-lg text-indigo-600">
              <Calendar className="h-5 w-5" />
            </div>
          </div>
          <div className="space-y-1">
            <p className="font-display text-2xl font-bold text-slate-900">{metrics.todayAppointments ?? 0}</p>
            <div className="flex items-center space-x-1.5 text-[11px] font-semibold text-slate-500">
              <Clock className="h-3.5 w-3.5" />
              <span>{metrics.activeAppointments} upcoming scheduled</span>
            </div>
          </div>
        </div>

        {/* KPI 3 - Bookings this week */}
        <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm hover:shadow-none transition space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Bookings This Week</span>
            <div className="bg-amber-50 p-2 rounded-lg text-amber-600">
              <Percent className="h-5 w-5" />
            </div>
          </div>
          <div className="space-y-1">
            <p className="font-display text-2xl font-bold text-slate-900">{metrics.weekBookings ?? 0}</p>
            <div className="flex items-center space-x-1.5 text-[11px] font-semibold text-emerald-600">
              <TrendingUp className="h-3.5 w-3.5" />
              <span>{metrics.conversionRate}% close rate</span>
            </div>
          </div>
        </div>

        {/* KPI 4 - Pipeline Value */}
        <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm hover:shadow-none transition space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pipeline Value</span>
            <div className="bg-emerald-50 p-2 rounded-lg text-emerald-600">
              <DollarSign className="h-5 w-5" />
            </div>
          </div>
          <div className="space-y-1">
            <p className="font-display text-2xl font-bold text-slate-900">{formatUSD(metrics.pipelineValue)}</p>
            <div className="flex items-center space-x-1.5 text-[11px] font-semibold text-emerald-600">
              <TrendingUp className="h-3.5 w-3.5" />
              <span>+{metrics.pipelineChange}% pipeline growth</span>
            </div>
          </div>
        </div>

      </div>

      {/* Analytics & Charts section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Sales Pipeline & Revenue Chart */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm lg:col-span-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display font-semibold text-md text-slate-950">Booked Revenue & Lead Funnel</h3>
              <p className="text-xs text-slate-400">Total pipeline values mapped over the past 6 months.</p>
            </div>
            <div className="flex items-center space-x-4 text-xs font-semibold">
              <div className="flex items-center space-x-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-indigo-600"></span>
                <span className="text-slate-500">Scheduled Deal Value</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-indigo-300"></span>
                <span className="text-slate-500">Captured Leads</span>
              </div>
            </div>
          </div>

          {/* Premium Custom SVG Chart */}
          <div className="h-64 w-full relative">
            <svg viewBox="0 0 700 240" className="w-full h-full overflow-visible">
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#4F46E5" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line x1="40" y1="20" x2="680" y2="20" stroke="#F1F5F9" strokeDasharray="3" />
              <line x1="40" y1="75" x2="680" y2="75" stroke="#F1F5F9" strokeDasharray="3" />
              <line x1="40" y1="130" x2="680" y2="130" stroke="#F1F5F9" strokeDasharray="3" />
              <line x1="40" y1="185" x2="680" y2="185" stroke="#F1F5F9" strokeDasharray="3" />
              <line x1="40" y1="220" x2="680" y2="220" stroke="#E2E8F0" />

              {/* Axis Labels */}
              <text x="15" y="25" className="text-[10px] font-mono fill-slate-400" textAnchor="end">$20k</text>
              <text x="15" y="80" className="text-[10px] font-mono fill-slate-400" textAnchor="end">$15k</text>
              <text x="15" y="135" className="text-[10px] font-mono fill-slate-400" textAnchor="end">$10k</text>
              <text x="15" y="190" className="text-[10px] font-mono fill-slate-400" textAnchor="end">$5k</text>

              {/* Chart Gradients and Lines */}
              {/* Path coordinates: Jan (50, 190), Feb (170, 160), Mar (290, 140), Apr (410, 80), May (530, 110), Jun (650, 40) */}
              <path 
                d="M 50 190 L 170 160 L 290 140 L 410 80 L 530 110 L 650 40 L 650 220 L 50 220 Z" 
                fill="url(#chartGradient)" 
              />
              <path 
                d="M 50 190 L 170 160 L 290 140 L 410 80 L 530 110 L 650 40" 
                fill="none" 
                stroke="#4F46E5" 
                strokeWidth="2.5" 
                strokeLinecap="round" 
              />

              {/* Secondary Indigo Line representing Lead counts */}
              {/* Path coordinates: Jan (50, 175), Feb (170, 185), Mar (290, 115), Apr (410, 125), May (530, 75), Jun (650, 60) */}
              <path 
                d="M 50 175 L 170 185 L 290 115 L 410 125 L 530 75 L 650 60" 
                fill="none" 
                stroke="#818CF8" 
                strokeWidth="1.5" 
                strokeDasharray="4 2" 
                strokeLinecap="round" 
              />

              {/* Data points */}
              {[
                { x: 50, y: 190, val: '$3.5k' },
                { x: 170, y: 160, val: '$6k' },
                { x: 290, y: 140, val: '$8k' },
                { x: 410, y: 80, val: '$14.5k' },
                { x: 530, y: 110, val: '$11.2k' },
                { x: 650, y: 40, val: '$18.4k' }
              ].map((pt, i) => (
                <g key={i} className="group/dot cursor-pointer">
                  <circle cx={pt.x} cy={pt.y} r="4" fill="#FFFFFF" stroke="#4F46E5" strokeWidth="2.5" />
                  <circle cx={pt.x} cy={pt.y} r="8" fill="#4F46E5" opacity="0" className="hover:opacity-15 transition" />
                </g>
              ))}

              {/* X Axis Labels */}
              <text x="50" y="238" className="text-[10px] font-mono fill-slate-400" textAnchor="middle">Jan</text>
              <text x="170" y="238" className="text-[10px] font-mono fill-slate-400" textAnchor="middle">Feb</text>
              <text x="290" y="238" className="text-[10px] font-mono fill-slate-400" textAnchor="middle">Mar</text>
              <text x="410" y="238" className="text-[10px] font-mono fill-slate-400" textAnchor="middle">Apr</text>
              <text x="530" y="238" className="text-[10px] font-mono fill-slate-400" textAnchor="middle">May</text>
              <text x="650" y="238" className="text-[10px] font-mono fill-slate-400" textAnchor="middle">Jun</text>
            </svg>
          </div>
        </div>

        {/* Lead Source Breakdown Panel */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm lg:col-span-4 space-y-6">
          <div>
            <h3 className="font-display font-semibold text-md text-slate-950">Active HVAC Service Needs</h3>
            <p className="text-xs text-slate-400">Captured deals categorized by requested service lines.</p>
          </div>

          <div className="space-y-4 pt-2">
            {[
              { category: 'AC System Replacement', percentage: 48, value: '$13,700', color: 'bg-indigo-600' },
              { category: 'Emergency HVAC Repair', percentage: 28, value: '$4,150', color: 'bg-indigo-400' },
              { category: 'Heat Pump Upgrades', percentage: 15, value: '$5,200', color: 'bg-emerald-500' },
              { category: 'Duct Cleaning & Tuneup', percentage: 9, value: '$360', color: 'bg-amber-500' }
            ].map((item, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">{item.category}</span>
                  <span className="font-bold text-slate-900">{item.value} <span className="text-slate-400 font-normal">({item.percentage}%)</span></span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full ${item.color} rounded-full`} style={{ width: `${item.percentage}%` }}></div>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-100 pt-4 text-center">
            <Link to="/dashboard/leads" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 inline-flex items-center space-x-1">
              <span>View all HVAC Leads</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

      </div>

      {/* Grid: Upcoming Appointments and Recent Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Column 1 - Upcoming Appointments List */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm lg:col-span-7 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display font-semibold text-md text-slate-950">Upcoming Technician Dispatch</h3>
              <p className="text-xs text-slate-400">Scheduled appointments loaded in technician queues.</p>
            </div>
            <Link to="/dashboard/appointments" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center space-x-1">
              <span>View Schedule</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-slate-100">
            {appointments.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No active dispatches scheduled. Use the Appointments panel to schedule one.
              </div>
            ) : (
              appointments.map((apt) => (
                <div key={apt.id} className="py-4.5 flex items-start justify-between first:pt-0 last:pb-0 gap-4">
                  <div className="space-y-1 text-left">
                    <p className="text-sm font-bold text-slate-900">{apt.leadName}</p>
                    <div className="flex flex-wrap gap-2 text-[11px] text-slate-500 font-medium">
                       <span className="flex items-center space-x-1 text-indigo-700 font-medium bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">
                        <Clock className="h-3 w-3 text-indigo-500" />
                        <span>{apt.time}</span>
                      </span>
                      <span className="bg-slate-100 px-2 py-0.5 rounded-md">Assigned: {apt.assignedTechnician}</span>
                      <span className="font-bold text-slate-700">{apt.type}</span>
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                      Scheduled
                    </span>
                    {apt.value && <p className="text-xs font-bold text-slate-900">{formatUSD(apt.value)}</p>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Column 2 - Recent Activity (Leads) */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm lg:col-span-5 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display font-semibold text-md text-slate-950">Active CRM Leads Feed</h3>
              <p className="text-xs text-slate-400">Recently added or triaged customers.</p>
            </div>
            <Link to="/dashboard/leads" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center space-x-1">
              <span>Manage CRM</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="space-y-4">
            {leads.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">No leads captured yet.</div>
            ) : (
              leads.map((lead) => {
                const colors: Record<string, string> = {
                  'New': 'bg-slate-50 text-slate-600 border-slate-100',
                  'Contacted': 'bg-amber-50 text-amber-600 border-amber-100',
                  'Qualified': 'bg-indigo-50 text-indigo-700 border-indigo-100',
                  'Proposal': 'bg-purple-50 text-purple-700 border-purple-100',
                  'Closed Won': 'bg-emerald-50 text-emerald-700 border-emerald-100',
                  'Closed Lost': 'bg-red-50 text-red-700 border-red-100'
                };

                return (
                  <div key={lead.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-lg bg-slate-50 hover:bg-slate-100/50 transition gap-4">
                    <div className="space-y-0.5 text-left">
                      <p className="text-xs font-bold text-slate-900">{lead.name}</p>
                      <p className="text-[10px] text-slate-500 font-medium truncate max-w-[180px]">{lead.hvacNeed}</p>
                    </div>
                    <div className="text-right space-y-1">
                      <span className={`inline-block px-1.5 py-0.5 rounded-md text-[9px] font-bold border ${colors[lead.status] || 'bg-slate-50 text-slate-600'}`}>
                        {lead.status}
                      </span>
                      <p className="text-[10px] font-semibold text-slate-900">{formatUSD(lead.value)}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
