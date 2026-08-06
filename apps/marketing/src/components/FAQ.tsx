import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const FAQ_ITEMS = [
  {
    q: "Will LeadFlow integrate with ServiceTitan or Housecall Pro?",
    a: "Yes! LeadFlow supports full API integrations with ServiceTitan, Housecall Pro, and Jobber. When a lead schedules an appointment, a customer record and booking request is pushed automatically into your existing dispatcher workspace.",
  },
  {
    q: "How does the AI know how to diagnose residential HVAC symptoms?",
    a: "Our models have been extensively trained on common home systems (including gas and electric furnaces, ducted heat pumps, mini-splits, and packaged AC systems). It can identify symptoms of refrigerant leaks, failing compressors, thermostat faults, or seasonal tune-up requests.",
  },
  {
    q: "Can we manually override the AI when a high-value lead is chatting?",
    a: "Absolutely. The dispatcher view features a live conversational inbox. If you see a major HVAC replacement quote chatting, your staff can click one button to pause the automated AI assistant and take over the keyboard live.",
  },
  {
    q: "Is it secure? Where is customer data stored?",
    a: "Data security is our top priority. All conversations, address entries, and phone contacts are encrypted and securely stored. We comply fully with SOC2 standards and respect homeowner privacy.",
  },
];

export default function FAQ() {
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  return (
    <section id="faq" className="py-24 bg-white border-b border-slate-100 px-6">
      <div className="max-w-4xl mx-auto space-y-16">
        <div className="text-center space-y-4">
          <h2 className="font-display font-bold text-xs text-indigo-600 uppercase tracking-widest">FAQ</h2>
          <p className="font-display font-extrabold text-3xl text-slate-900 tracking-tight leading-tight">
            Frequently Asked Questions
          </p>
        </div>

        <div className="space-y-4">
          {FAQ_ITEMS.map((item, index) => (
            <div key={index} className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
              <button
                onClick={() => setFaqOpen(faqOpen === index ? null : index)}
                className="w-full flex items-center justify-between p-5 text-left font-bold text-slate-950 hover:bg-slate-50 transition"
              >
                <span>{item.q}</span>
                <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${faqOpen === index ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence initial={false}>
                {faqOpen === index && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="border-t border-slate-200 bg-white"
                  >
                    <p className="p-5 text-sm text-slate-600 leading-relaxed font-semibold">{item.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
