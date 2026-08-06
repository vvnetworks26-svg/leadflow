import React from 'react';
import { Code2 } from 'lucide-react';

export default function WidgetSettings() {
  const widgetToken = (import.meta as any).env?.VITE_WIDGET_TOKEN ?? '';

  return (
    <div className="space-y-6 animate-slide-up max-w-3xl">
      <div>
        <h2 className="font-display font-extrabold text-2xl text-slate-900 tracking-tight">Widget Settings</h2>
        <p className="text-sm text-slate-500">Embed the AI chat widget on your website and manage its appearance.</p>
      </div>

      {/* Embed snippet */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
        <h3 className="font-display font-semibold text-sm text-slate-900 flex items-center space-x-2">
          <Code2 className="h-4 w-4 text-indigo-500" />
          <span>Embed Code</span>
        </h3>
        <p className="text-xs text-slate-500">
          Add this snippet to the <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">&lt;body&gt;</code> of any webpage where you want the chat widget to appear.
        </p>
        <pre className="bg-slate-950 text-emerald-400 text-xs font-mono p-4 rounded-lg overflow-x-auto leading-relaxed">
{`<script>
  window.LeadFlowConfig = { token: "${widgetToken || 'YOUR_WIDGET_TOKEN'}" };
</script>
<script src="${(import.meta as any).env?.VITE_API_URL ?? 'http://localhost:4000'}/widget.js" async></script>`}
        </pre>
      </div>

      {/* Placeholder customisation */}
      <div className="bg-white border border-slate-200 rounded-xl p-12 shadow-sm text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center mx-auto">
          <Code2 className="h-6 w-6 text-indigo-500" />
        </div>
        <p className="font-display font-bold text-slate-800">Widget Customisation</p>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          Visual customisation — colours, launcher icon, welcome message, and placement — is under development.
        </p>
      </div>
    </div>
  );
}
