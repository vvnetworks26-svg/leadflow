/**
 * api.ts — Backwards-compatible facade that re-exports from the split domain APIs.
 * All existing imports of `apiService` continue to work unchanged.
 */
import { leadsApi } from './api/leads';
import { appointmentsApi } from './api/appointments';
import { conversationsApi } from './api/conversations';
import { dashboardApi } from './api/dashboard';

export { leadsApi, appointmentsApi, conversationsApi, dashboardApi };

export const apiService = {
  // Leads
  getLeads: leadsApi.getAll,
  getLeadById: leadsApi.getById,
  createLead: leadsApi.create,
  updateLead: leadsApi.update,
  deleteLead: leadsApi.delete,

  // Appointments
  getAppointments: appointmentsApi.getAll,
  getAppointmentById: appointmentsApi.getById,
  createAppointment: appointmentsApi.create,
  updateAppointment: appointmentsApi.update,

  // Conversations
  getConversations: conversationsApi.getAll,
  updateConversationStatus: conversationsApi.updateStatus,
  addMessageToConversation: conversationsApi.addMessage,
  getOrCreateConversation: conversationsApi.getOrCreate,

  // Metrics
  getMetrics: dashboardApi.getMetrics
};
