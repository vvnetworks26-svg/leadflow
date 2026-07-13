/**
 * widgetApiClient.ts
 *
 * Dedicated HTTP client for the anonymous chat widget.
 * All requests go to /api/v1/widget/:token/* — no JWT required.
 *
 * This client is intentionally separate from apiClient.ts so that:
 *   - No Authorization header is ever attached to widget requests.
 *   - Visitors browsing the public landing page never trigger 401 errors.
 *   - The dashboard's authenticated repositories remain unchanged.
 *
 * The widget token is the organization's slug or MongoDB _id.
 * It is read once from VITE_WIDGET_TOKEN at module load time and is
 * considered immutable for the lifetime of the page.
 */

import axios from 'axios';
import type { Lead, Conversation } from '../../types';

// ─── Configuration ────────────────────────────────────────────────────────────

const BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL as string | undefined)
  ?? 'http://localhost:4000';

const WIDGET_TOKEN =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_WIDGET_TOKEN as string | undefined)
  ?? '';

if (!WIDGET_TOKEN) {
  console.warn(
    '[widgetApiClient] VITE_WIDGET_TOKEN is not set. ' +
    'Widget API calls will fail with 404. ' +
    'Add VITE_WIDGET_TOKEN=<org-slug> to your .env file.'
  );
}

// ─── Axios instance — no auth headers ─────────────────────────────────────────

const widgetHttp = axios.create({
  baseURL: `${BASE_URL}/api/v1/widget`,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});

widgetHttp.interceptors.response.use(
  res => res,
  err => {
    const message =
      err.response?.data?.message ??
      err.message ??
      'Widget request failed';
    return Promise.reject(Object.assign(new Error(message), {
      status: err.response?.status ?? 0,
      code:   err.response?.data?.code,
    }));
  }
);

// ─── Public API ───────────────────────────────────────────────────────────────

export type WidgetOrgConfig = {
  organizationId: string;
  name:           string;
  slug:           string;
  industry:       string;
  timezone:       string;
};

export const widgetApiClient = {

  /**
   * GET /api/v1/widget/:token/config
   * Returns public organization metadata. No auth required.
   */
  async getConfig(): Promise<WidgetOrgConfig> {
    const res = await widgetHttp.get<{ status: string; data: WidgetOrgConfig }>(
      `/${WIDGET_TOKEN}/config`
    );
    return res.data.data;
  },

  /**
   * POST /api/v1/widget/:token/leads
   * Create a CRM lead for this organization. No auth required.
   *
   * The server resolves the organizationId from the token — it is never
   * trusted from the request body.
   */
  async createLead(data: {
    name:                string;
    phone:               string;
    email?:              string;
    address?:            string;
    zipCode?:            string;
    hvacNeed:            string;
    emergency?:          boolean;
    status?:             string;
    priority?:           string;
    value?:              number;
    source?:             string;
    conversationId?:     string;
    qualificationReason?:string;
    preferredDay?:       string;
    notes?:              string;
  }): Promise<Lead> {
    const res = await widgetHttp.post<{ status: string; data: Lead }>(
      `/${WIDGET_TOKEN}/leads`,
      { ...data, source: data.source ?? 'widget' }
    );
    return res.data.data;
  },

  /**
   * POST /api/v1/widget/:token/conversations
   * Create a conversation record. No auth required.
   */
  async createConversation(data: {
    leadName:      string;
    leadPhone:     string;
    leadEmail?:    string;
    hvacNeed?:     string;
    status?:       string;
    lastMessageAt?:string;
    messages?:     Array<{ id: string; sender: 'ai' | 'user' | 'agent'; text: string; timestamp: string }>;
    leadId?:       string;
    appointmentId?:string;
  }): Promise<Conversation> {
    const res = await widgetHttp.post<{ status: string; data: Conversation }>(
      `/${WIDGET_TOKEN}/conversations`,
      data
    );
    return res.data.data;
  },

  /**
   * POST /api/v1/widget/:token/book
   *
   * Atomic booking workflow — creates conversation, lead, and appointment
   * server-side in a single request. No JWT required.
   *
   * Returns a full BookingConfirmation-compatible payload.
   */
  async book(data: {
    customerName:        string;
    phone:               string;
    email?:              string;
    address?:            string;
    zipCode?:            string;
    service:             string;
    emergency?:          boolean;
    date:                string;    // YYYY-MM-DD
    time:                string;    // HH:MM
    displayDate?:        string;
    displayTime?:        string;
    duration?:           number;
    preferredDay?:       string;
    qualificationReason?:string;
    status?:             string;
    priority?:           string;
    value?:              number;
    notes?:              string;
    conversationId?:     string;
    messages?:           Array<{ id: string; sender: 'ai' | 'user' | 'agent'; text: string; timestamp: string }>;
  }): Promise<{
    appointmentId:     string;
    confirmationNumber:string;
    conversationId:    string;
    leadId:            string;
    customerName:      string;
    service:           string;
    date:              string;
    time:              string;
    displayDate:       string;
    displayTime:       string;
    estimatedDuration: number;
    address:           string;
  }> {
    const res = await widgetHttp.post<{
      status: string;
      data: {
        appointmentId:     string;
        confirmationNumber:string;
        conversationId:    string;
        leadId:            string;
        customerName:      string;
        service:           string;
        date:              string;
        time:              string;
        displayDate:       string;
        displayTime:       string;
        estimatedDuration: number;
        address:           string;
      };
    }>(`/${WIDGET_TOKEN}/book`, data);
    return res.data.data;
  },

  /**
   * POST /api/v1/widget/:token/chat
   * Send a message to the AI agent. No auth required.
   * Returns the AI reply, updated stage, and a bookingTriggered flag.
   */
  async chat(data: {
    message:         string;
    conversationId:  string;
    currentPage?:    string;
  }): Promise<{
    reply:           string;
    stage:           string;
    bookingTriggered:boolean;
  }> {
    const res = await widgetHttp.post<{
      status: string;
      data: { reply: string; stage: string; bookingTriggered: boolean };
    }>(`/${WIDGET_TOKEN}/chat`, data);
    return res.data.data;
  },

  /** Returns the configured widget token (org slug / ID). */
  getToken(): string {
    return WIDGET_TOKEN;
  },

  /** Returns true when the widget token is configured. */
  isConfigured(): boolean {
    return WIDGET_TOKEN.length > 0;
  },
};
