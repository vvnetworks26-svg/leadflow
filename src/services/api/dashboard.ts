import { DashboardMetrics } from '../../types';
import { leadsApi } from './leads';
import { appointmentsApi } from './appointments';

export const dashboardApi = {
  getMetrics: async (): Promise<DashboardMetrics> => {
    const [leads, appointments] = await Promise.all([
      leadsApi.getAll(),
      appointmentsApi.getAll()
    ]);

    const today = new Date().toISOString().split('T')[0];
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday
    const weekStartStr = weekStart.toISOString().split('T')[0];

    const activeLeadsCount = leads.filter((l) => l.status !== 'Closed Lost').length;
    const activeAppointmentsCount = appointments.filter(
      (a) => a.status === 'Scheduled' || a.status === 'Confirmed'
    ).length;
    const todayAppointments = appointments.filter(a => a.date === today).length;
    const weekBookings = appointments.filter(
      a => a.date >= weekStartStr && a.date <= today
    ).length;

    const wonLeads = leads.filter((l) => l.status === 'Closed Won').length;
    const totalEndedLeads = leads.filter(
      (l) => l.status === 'Closed Won' || l.status === 'Closed Lost'
    ).length;
    const conversionRate =
      totalEndedLeads > 0 ? Math.round((wonLeads / totalEndedLeads) * 100) : 68;

    const pipelineValue = leads
      .filter((l) => l.status !== 'Closed Won' && l.status !== 'Closed Lost')
      .reduce((sum, l) => sum + l.value, 0);

    return {
      totalLeads: activeLeadsCount,
      leadsChange: 12.5,
      activeAppointments: activeAppointmentsCount,
      appointmentsChange: 8.2,
      conversionRate,
      conversionChange: 4.1,
      pipelineValue,
      pipelineChange: 15.3,
      todayAppointments,
      weekBookings
    };
  }
};
