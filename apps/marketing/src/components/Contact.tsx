import React, { useState } from 'react';
import { CheckCircle } from 'lucide-react';
import { widgetApiClient } from '../services/api/widgetApiClient';
import { getDashboardUrl } from '@leadflow/shared';

export default function Contact() {
  const dashboardUrl = getDashboardUrl();

  const [contactForm, setContactForm] = useState({
    name: '', email: '', phone: '', address: '', hvacNeed: 'AC Repair', message: '',
  });
  const [contactSubmitted, setContactSubmitted] = useState(false);

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Use the public widget endpoint — no JWT required.
      await widgetApiClient.createLead({
        name:     contactForm.name,
        phone:    contactForm.phone,
        email:    contactForm.email,
        address:  contactForm.address,
        hvacNeed: contactForm.hvacNeed,
        status:   'New',
        priority: 'Medium',
        value:    1200,
        source:   'Contact Form',
        notes:    `Contact Form Submission: "${contactForm.message}"`,
      });
      setContactSubmitted(true);
    } catch (err) {
      console.error('[Contact] contact form submit failed:', err);
    }
  };

  return (
    <section id="contact" className="py-24 bg-slate-50 px-6">
      <div className="max-w-3xl mx-auto space-y-12">
        <div className="text-center space-y-4">
          <h2 className="font-display font-bold text-xs text-indigo-600 uppercase tracking-widest">Contact</h2>
          <p className="font-display font-extrabold text-3xl text-slate-900 tracking-tight leading-tight">
            Talk to Our Enterprise Team
          </p>
          <p className="text-slate-500 font-semibold">Need a custom demo or have custom dispatch requirements? We would love to chat.</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
          {contactSubmitted ? (
            <div className="text-center py-8 space-y-4 animate-fade-in">
              <div className="h-12 w-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle className="h-6 w-6" />
              </div>
              <h3 className="font-display font-extrabold text-xl text-slate-900">Message Received!</h3>
              <p className="text-sm text-slate-500 max-w-sm mx-auto font-medium">Thank you. We have logged your request in our database. You can log into the dashboard to inspect this lead entry immediately.</p>
              <a
                href={`${dashboardUrl}/sign-in`}
                className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm px-6 py-2.5 rounded-lg transition shadow-sm"
              >
                Sign In to Dashboard
              </a>
            </div>
          ) : (
            <form onSubmit={handleContactSubmit} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Your Name</label>
                  <input
                    type="text"
                    required
                    value={contactForm.name}
                    onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                    placeholder="David Sterling"
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-slate-50/50 text-sm outline-none font-semibold transition"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Your Email</label>
                  <input
                    type="email"
                    required
                    value={contactForm.email}
                    onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                    placeholder="david@sterlinghvac.com"
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-slate-50/50 text-sm outline-none font-semibold transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Phone Number</label>
                  <input
                    type="tel"
                    required
                    value={contactForm.phone}
                    onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                    placeholder="(555) 000-0000"
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-slate-50/50 text-sm outline-none font-semibold transition"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Services Needed</label>
                  <select
                    value={contactForm.hvacNeed}
                    onChange={(e) => setContactForm({ ...contactForm, hvacNeed: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-slate-50/50 text-sm outline-none font-bold transition"
                  >
                    <option value="AC Repair">AC Repair & Troubleshooting</option>
                    <option value="Heat Pump Install">Heat Pump Installation</option>
                    <option value="Maintenance">Annual Maintenance Tune-up</option>
                    <option value="System Replacement Quote">Full System Replacement Quote</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Office Address</label>
                <input
                  type="text"
                  required
                  value={contactForm.address}
                  onChange={(e) => setContactForm({ ...contactForm, address: e.target.value })}
                  placeholder="123 HVAC Highway, Suite A"
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-slate-50/50 text-sm outline-none font-semibold transition"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Message</label>
                <textarea
                  rows={4}
                  value={contactForm.message}
                  onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                  placeholder="Tell us about your fleet, CRM, and target volume..."
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-slate-50/50 text-sm outline-none font-semibold resize-none transition"
                ></textarea>
              </div>

              <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-lg transition shadow-md shadow-indigo-100">
                Submit Request & View Seed Database
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
