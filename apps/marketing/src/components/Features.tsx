import React from 'react';
import {
  Bot,
  Calendar,
  PhoneCall,
  TrendingUp,
  ShieldCheck,
  MessageSquare,
} from 'lucide-react';

export default function Features() {
  return (
    <section id="features" className="py-24 bg-white border-t border-b border-slate-100 px-6">
      <div className="max-w-7xl mx-auto space-y-16 animate-fade-in">
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <h2 className="font-display font-bold text-xs text-indigo-600 uppercase tracking-widest">Platform Capabilities</h2>
          <p className="font-display font-extrabold text-3xl sm:text-4xl text-slate-900 tracking-tight leading-tight">
            Engineered Exclusively for Residential and Commercial Service Contractors
          </p>
          <p className="text-slate-500 font-medium text-md">
            Most live chats require manual staff monitoring. LeadFlow uses trained HVAC intelligence to extract model numbers, diagnose symptoms, check calendar slots, and log jobs.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {/* Feature 1 */}
          <div className="bg-slate-50 hover:bg-slate-100/70 transition duration-200 border border-slate-150 p-8 rounded-xl space-y-4">
            <div className="bg-indigo-50 p-3 rounded-lg text-indigo-600 w-fit">
              <Bot className="h-6 w-6" />
            </div>
            <h3 className="font-display font-extrabold text-lg text-slate-900">HVAC Trained Conversation</h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Trained specifically on air handlers, ductwork, compressors, furnace systems, SEER efficiency levels, heat pumps, and common fault codes.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="bg-slate-50 hover:bg-slate-100/70 transition duration-200 border border-slate-150 p-8 rounded-xl space-y-4">
            <div className="bg-indigo-50 p-3 rounded-lg text-indigo-600 w-fit">
              <Calendar className="h-6 w-6" />
            </div>
            <h3 className="font-display font-extrabold text-lg text-slate-900">Intelligent Dispatch Sync</h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Reads real-time technicians availability windows. Books actual slots directly into your booking queue, preventing double booking.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="bg-slate-50 hover:bg-slate-100/70 transition duration-200 border border-slate-150 p-8 rounded-xl space-y-4">
            <div className="bg-indigo-50 p-3 rounded-lg text-indigo-600 w-fit">
              <PhoneCall className="h-6 w-6" />
            </div>
            <h3 className="font-display font-extrabold text-lg text-slate-900">Instant SMS & Web Capture</h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Captures leads from any desktop or mobile website widget, and forwards alerts immediately to phone lines via smart SMS integrations.
            </p>
          </div>

          {/* Feature 4 */}
          <div className="bg-slate-50 hover:bg-slate-100/70 transition duration-200 border border-slate-150 p-8 rounded-xl space-y-4">
            <div className="bg-indigo-50 p-3 rounded-lg text-indigo-600 w-fit">
              <TrendingUp className="h-6 w-6" />
            </div>
            <h3 className="font-display font-extrabold text-lg text-slate-900">Deal Value Priority Triage</h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Recognizes high-revenue jobs like "system replacement" and alerts project managers instantly, putting maintenance requests on secondary triage.
            </p>
          </div>

          {/* Feature 5 */}
          <div className="bg-slate-50 hover:bg-slate-100/70 transition duration-200 border border-slate-150 p-8 rounded-xl space-y-4">
            <div className="bg-indigo-50 p-3 rounded-lg text-indigo-600 w-fit">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h3 className="font-display font-extrabold text-lg text-slate-900">Address & Map Validation</h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Cleanses and verifies lead addresses, matching them directly to your designated dispatch service radiuses before scheduling technicians.
            </p>
          </div>

          {/* Feature 6 */}
          <div className="bg-slate-50 hover:bg-slate-100/70 transition duration-200 border border-slate-150 p-8 rounded-xl space-y-4">
            <div className="bg-indigo-50 p-3 rounded-lg text-indigo-600 w-fit">
              <MessageSquare className="h-6 w-6" />
            </div>
            <h3 className="font-display font-extrabold text-lg text-slate-900">Centralized Live Dashboard</h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              A gorgeous unified dashboard for dispatcher oversight. Override automated AI conversations at any moment to take control of customer chat lines.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
