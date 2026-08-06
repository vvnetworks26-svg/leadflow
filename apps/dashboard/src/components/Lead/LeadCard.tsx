import React from 'react';
import { Lead, LeadStatus, LeadPriority } from '../../types';
import { Phone, Mail, AlertTriangle, MessageSquare } from 'lucide-react';

interface Props {
  lead: Lead;
  onClick: (lead: Lead) => void;
  key?: React.Key;
}

const statusColors: Record<LeadStatus, string> = {
  'New': 'bg-slate-50 text-slate-600 border-slate-100',
  'Contacted': 'bg-amber-50 text-amber-700 border-amber-100',
  'Qualified': 'bg-indigo-50 text-indigo-700 border-indigo-100',
  'Unqualified': 'bg-red-50 text-red-700 border-red-100',
  'Proposal': 'bg-purple-50 text-purple-700 border-purple-100',
  'Closed Won': 'bg-emerald-50 text-emerald-700 border-emerald-100',
  'Closed Lost': 'bg-red-50 text-red-700 border-red-100'
};

const priorityColors: Record<LeadPriority, string> = {
  'High': 'bg-red-50 text-red-700 border-red-100',
  'Medium': 'bg-amber-50 text-amber-600 border-amber-100',
  'Low': 'bg-gray-100 text-gray-600 border-gray-200'
};

/**
 * Compact row representation of a lead used in the Leads table.
 * Clicking opens the LeadDetails drawer.
 */
export function LeadCard({ lead, onClick }: Props) {
  return (
    <tr
      onClick={() => onClick(lead)}
      className="hover:bg-slate-50/70 transition cursor-pointer"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick(lead)}
      aria-label={`View lead for ${lead.name}`}
    >
      <td className="px-6 py-4">
        <div className="space-y-0.5">
          <div className="flex items-center space-x-1.5">
            <p className="text-xs font-bold text-slate-900">{lead.name}</p>
            {lead.emergency && (
              <AlertTriangle className="h-3 w-3 text-red-500" aria-label="Emergency" />
            )}
            {lead.conversationId && (
              <MessageSquare className="h-3 w-3 text-indigo-400" aria-label="From AI chat" />
            )}
          </div>
          <p className="text-[10px] text-slate-400 font-medium">{lead.email || '—'}</p>
        </div>
      </td>
      <td className="px-6 py-4">
        <span className="text-xs font-medium text-slate-700">{lead.hvacNeed}</span>
      </td>
      <td className="px-6 py-4">
        <span className="text-xs font-bold text-slate-900">${lead.value.toLocaleString()}</span>
      </td>
      <td className="px-6 py-4">
        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusColors[lead.status]}`}>
          {lead.status}
        </span>
      </td>
      <td className="px-6 py-4">
        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${priorityColors[lead.priority]}`}>
          {lead.priority}
        </span>
      </td>
      <td className="px-6 py-4">
        <span className="text-[11px] font-mono font-medium text-slate-400 bg-slate-50 px-2 py-1 rounded-md">
          {lead.source}
        </span>
      </td>
    </tr>
  );
}
