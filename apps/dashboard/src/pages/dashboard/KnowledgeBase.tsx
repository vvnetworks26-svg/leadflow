import React from 'react';
import { BookOpen } from 'lucide-react';

export default function KnowledgeBase() {
  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h2 className="font-display font-extrabold text-2xl text-slate-900 tracking-tight">Knowledge Base</h2>
        <p className="text-sm text-slate-500">Train your AI receptionist with custom FAQs, service details, and business knowledge.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-12 shadow-sm text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center mx-auto">
          <BookOpen className="h-6 w-6 text-indigo-500" />
        </div>
        <p className="font-display font-bold text-slate-800">AI Knowledge Base</p>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          Custom document ingestion, FAQ editor, and AI training tools are under development. Your AI already uses the settings configured in Business Settings.
        </p>
      </div>
    </div>
  );
}
