import React from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, CalendarDays, Clock, Hash, User, Wrench } from 'lucide-react';
import { BookingConfirmation } from '../../types';

interface Props {
  confirmation: BookingConfirmation;
}

/**
 * Inline booking confirmation card shown in the chat after a successful booking.
 */
export function BookingConfirmationCard({ confirmation }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
      className="w-full"
      role="region"
      aria-label="Booking confirmation"
    >
      <div className="bg-white border border-emerald-200 rounded-2xl overflow-hidden shadow-sm">

        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-emerald-600 to-emerald-500">
          <CheckCircle2 className="h-4 w-4 text-white flex-shrink-0" aria-hidden="true" />
          <p className="text-[13px] font-semibold text-white">Appointment Confirmed</p>
        </div>

        {/* Details */}
        <div className="px-4 py-3 space-y-2">
          <Row icon={<Hash />}         label="Reference"  value={confirmation.confirmationNumber} mono />
          <Row icon={<User />}         label="Name"       value={confirmation.customerName} />
          <Row icon={<Wrench />}       label="Service"    value={confirmation.service} />
          <Row icon={<CalendarDays />} label="Date"       value={confirmation.displayDate} />
          <Row icon={<Clock />}        label="Time"       value={confirmation.displayTime} />
          <Row icon={<Clock />}        label="Duration"   value={`~${confirmation.estimatedDuration} min`} />
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-emerald-50 border-t border-emerald-100">
          <p className="text-[11px] text-emerald-700 font-medium text-center">
            A technician will call 30 min before arrival.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function Row({
  icon, label, value, mono = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex-shrink-0 text-slate-400 [&>svg]:h-3.5 [&>svg]:w-3.5" aria-hidden="true">
        {icon}
      </span>
      <span className="text-[11px] text-slate-400 w-16 flex-shrink-0">{label}</span>
      <span className={`text-[12px] font-semibold text-slate-800 min-w-0 truncate ${mono ? 'font-mono tracking-tight' : ''}`}>
        {value}
      </span>
    </div>
  );
}
