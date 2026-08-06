import React from 'react';
import { CheckCircle, X } from 'lucide-react';

export default function Benefits() {
  return (
    <section id="benefits" className="py-24 bg-slate-50 px-6">
      <div className="max-w-7xl mx-auto space-y-16">
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <h2 className="font-display font-bold text-xs text-indigo-600 uppercase tracking-widest">Why LeadFlow?</h2>
          <p className="font-display font-extrabold text-3xl sm:text-4xl text-slate-900 tracking-tight leading-tight">
            Transform Your HVAC Front Office Operations
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Before */}
          <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-6 shadow-sm">
            <h3 className="font-display font-bold text-xl text-red-600 flex items-center space-x-2">
              <X className="h-5 w-5" />
              <span>The Traditional Front Office</span>
            </h3>

            <ul className="space-y-4 text-slate-600 text-sm">
              <li className="flex items-start space-x-3">
                <div className="bg-red-50 p-1 rounded text-red-600 mt-0.5">
                  <X className="h-3 w-3" />
                </div>
                <span className="font-medium"><strong>Missed Calls:</strong> 62% of homeowners hang up and call a competitor if their call goes to voicemail after hours.</span>
              </li>
              <li className="flex items-start space-x-3">
                <div className="bg-red-50 p-1 rounded text-red-600 mt-0.5">
                  <X className="h-3 w-3" />
                </div>
                <span className="font-medium"><strong>Slow Booking:</strong> Customers submitting web forms wait an average of 4.2 hours for a callback, by which time they have booked elsewhere.</span>
              </li>
              <li className="flex items-start space-x-3">
                <div className="bg-red-50 p-1 rounded text-red-600 mt-0.5">
                  <X className="h-3 w-3" />
                </div>
                <span className="font-medium"><strong>Wasted Dispatch Trips:</strong> Dispatchers send techs to "emergency calls" only to find out they just need batteries in a thermostat.</span>
              </li>
            </ul>
          </div>

          {/* After */}
          <div className="bg-slate-950 text-white rounded-xl p-8 space-y-6 shadow-xl relative overflow-hidden">
            <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 bg-indigo-600 h-48 w-48 rounded-full blur-2xl opacity-40"></div>

            <h3 className="font-display font-bold text-xl text-indigo-400 flex items-center space-x-2 relative z-10">
              <CheckCircle className="h-5 w-5 text-indigo-500" />
              <span>LeadFlow AI Office Assistant</span>
            </h3>

            <ul className="space-y-4 text-slate-200 text-sm relative z-10">
              <li className="flex items-start space-x-3">
                <div className="bg-indigo-900 p-1 rounded text-indigo-300 mt-0.5">
                  <CheckCircle className="h-3 w-3" />
                </div>
                <span className="font-semibold"><strong>Immediate Response:</strong> 100% of website visits and text messages answered within 8 seconds, 24 hours a day.</span>
              </li>
              <li className="flex items-start space-x-3">
                <div className="bg-indigo-900 p-1 rounded text-indigo-300 mt-0.5">
                  <CheckCircle className="h-3 w-3" />
                </div>
                <span className="font-semibold"><strong>Frictionless Schedulers:</strong> Automatically confirms location eligibility, identifies equipment needs, and assigns calendar blocks.</span>
              </li>
              <li className="flex items-start space-x-3">
                <div className="bg-indigo-900 p-1 rounded text-indigo-300 mt-0.5">
                  <CheckCircle className="h-3 w-3" />
                </div>
                <span className="font-semibold"><strong>Intelligent Qualification:</strong> Validates address service zones and pre-diagnoses problems (clogged drains, worn contactors) before techs roll out.</span>
              </li>
            </ul>
          </div>
        </div>

        {/* How It Works */}
        <div id="how-it-works" className="pt-8 space-y-16">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <h2 className="font-display font-bold text-xs text-indigo-600 uppercase tracking-widest">Simplifying HVAC</h2>
            <p className="font-display font-extrabold text-3xl sm:text-4xl text-slate-900 tracking-tight leading-tight">
              From Visitor to Booked Job in 4 Simple Steps
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="space-y-4 relative">
              <div className="text-5xl font-extrabold text-indigo-100/60 font-display">01</div>
              <h4 className="font-display font-extrabold text-lg text-slate-950">Embed Widget</h4>
              <p className="text-sm text-slate-500 leading-relaxed font-semibold">
                Add our snippet to your website with one click. Completely custom branded to match your logo and colors.
              </p>
            </div>
            <div className="space-y-4 relative">
              <div className="text-5xl font-extrabold text-indigo-100/60 font-display">02</div>
              <h4 className="font-display font-extrabold text-lg text-slate-950">AI Triages Customer</h4>
              <p className="text-sm text-slate-500 leading-relaxed font-semibold">
                Our bot chats with visitors, analyzes symptoms, qualifies their address, and calculates initial estimate metrics.
              </p>
            </div>
            <div className="space-y-4 relative">
              <div className="text-5xl font-extrabold text-indigo-100/60 font-display">03</div>
              <h4 className="font-display font-extrabold text-lg text-slate-950">Auto-Book Appointment</h4>
              <p className="text-sm text-slate-500 leading-relaxed font-semibold">
                The bot presents available dispatch blocks from your calendar and locks in the appointment for the customer.
              </p>
            </div>
            <div className="space-y-4 relative">
              <div className="text-5xl font-extrabold text-indigo-100/60 font-display">04</div>
              <h4 className="font-display font-extrabold text-lg text-slate-950">Dispatched!</h4>
              <p className="text-sm text-slate-500 leading-relaxed font-semibold">
                The lead info, customer profile, and appointment details are logged securely, syncing straight to your dispatcher screen.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
