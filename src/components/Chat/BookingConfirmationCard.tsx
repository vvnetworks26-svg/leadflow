import React from 'react';
import { CheckCircle, Calendar, Clock, Hash, User, Wrench } from 'lucide-react';
import { BookingConfirmation } from '../../types';

interface Props {
  confirmation: BookingConfirmation;
}

/**
 * Inline booking confirmation card shown in the chat after successful booking.
 * Presents all key appointment details in a compact, professional format.
 */
export function BookingConfirmationCard({ confirmation }: Props) {
  return (
    <div className="px-4 py-2">
      <div className="bg-white border border-emerald-200 rounded-2xl overflow-hidden shadow-sm">
        {/* Header */}
        <div className="bg-emerald-600 px-4 py-3 flex items-center space-x-2">
          <CheckCircle className="h-4 w-4 text-white" />
          <p className="text-xs font-bold text-white">Appointment Confirmed</p>
        </div>

        {/* Details */}
        <div className="px-4 py-3 space-y-2.5">
          <Row icon={<Hash className="h-3.5 w-3.5 text-slate-400" />} label="Confirmation" value={confirmation.confirmationNumber} mono />
          <Row icon={<User className="h-3.5 w-3.5 text-slate-400" />} label="Name" value={confirmation.customerName} />
          <Row icon={<Wrench className="h-3.5 w-3.5 text-slate-400" />} label="Service" value={confirmation.service} />
          <Row icon={<Calendar className="h-3.5 w-3.5 text-slate-400" />} label="Date" value={confirmation.displayDate} />
          <Row icon={<Clock className="h-3.5 w-3.5 text-slate-400" />} label="Time" value={confirmation.displayTime} />
          <Row
            icon={<Clock className="h-3.5 w-3.5 text-slate-400" />}
            label="Duration"
            value={`~${confirmation.estimatedDuration} min`}
          />
        </div>

        <div className="px-4 py-2.5 bg-emerald-50 border-t border-emerald-100">
          <p className="text-[10px] text-emerald-700 font-medium text-center">
            A technician will confirm 30 min before arrival.
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  mono = false
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center space-x-2">
      <span className="flex-shrink-0">{icon}</span>
      <span className="text-[10px] text-slate-500 w-20 flex-shrink-0">{label}</span>
      <span className={`text-[11px] font-semibold text-slate-800 ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  );
}
