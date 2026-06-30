import React from 'react';
import { CheckCircle, Circle, Clock, UserCheck, Star } from 'lucide-react';
import { Appointment } from '../../types';

interface TimelineEvent {
  label: string;
  timestamp?: string;
  done: boolean;
  icon: React.ReactNode;
}

interface Props {
  appointment: Appointment;
}

/**
 * AppointmentTimeline — reusable vertical timeline showing
 * the lifecycle of an appointment from booking to completion.
 */
export function AppointmentTimeline({ appointment }: Props) {
  const events: TimelineEvent[] = [
    {
      label: 'Lead Captured',
      timestamp: appointment.createdAt,
      done: true,
      icon: <Circle className="h-3.5 w-3.5" />
    },
    {
      label: 'Appointment Booked',
      timestamp: appointment.createdAt,
      done: true,
      icon: <Clock className="h-3.5 w-3.5" />
    },
    {
      label: 'Confirmed',
      timestamp: appointment.status === 'Confirmed' || appointment.status === 'Completed' || appointment.status === 'Rescheduled'
        ? appointment.updatedAt ?? appointment.createdAt
        : undefined,
      done: ['Confirmed', 'Completed', 'Rescheduled'].includes(appointment.status),
      icon: <CheckCircle className="h-3.5 w-3.5" />
    },
    {
      label: 'Technician Assigned',
      timestamp: undefined,
      done: Boolean(appointment.assignedTechnician),
      icon: <UserCheck className="h-3.5 w-3.5" />
    },
    {
      label: 'Completed',
      timestamp: appointment.status === 'Completed' ? appointment.updatedAt : undefined,
      done: appointment.status === 'Completed',
      icon: <Star className="h-3.5 w-3.5" />
    }
  ];

  return (
    <div className="space-y-0">
      {events.map((event, i) => (
        <div key={event.label} className="flex items-start space-x-3">
          {/* Connector */}
          <div className="flex flex-col items-center">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
              event.done
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-400 border border-slate-200'
            }`}>
              {event.icon}
            </div>
            {i < events.length - 1 && (
              <div className={`w-0.5 h-6 mt-0.5 ${event.done ? 'bg-indigo-200' : 'bg-slate-100'}`} />
            )}
          </div>

          {/* Content */}
          <div className="pb-4 flex-1">
            <p className={`text-xs font-semibold ${event.done ? 'text-slate-800' : 'text-slate-400'}`}>
              {event.label}
            </p>
            {event.timestamp && (
              <p className="text-[10px] text-slate-400 mt-0.5">
                {new Date(event.timestamp).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                })}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
