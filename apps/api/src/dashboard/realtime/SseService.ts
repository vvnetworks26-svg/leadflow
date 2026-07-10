/**
 * SseService.ts
 *
 * Server-Sent Events (SSE) realtime layer.
 * Clients connect once; the server pushes events as they occur.
 * Supports: automatic reconnect (EventSource default), heartbeat every 25s.
 *
 * Events pushed: lead_created, booking_created, stage_changed,
 *   workflow_executed, widget_event, notification, revenue_update.
 *
 * Architecture: in-process pub/sub using EventEmitter.
 * In production, replace with Redis pub/sub so multiple API instances share state.
 */

import { EventEmitter }   from 'events';
import type { Response }  from 'express';
import { logger }         from '../../utils/logger';

export type SseEventType =
  | 'lead_created'    | 'booking_created'   | 'stage_changed'
  | 'workflow_run'    | 'widget_event'       | 'notification'
  | 'revenue_update'  | 'conversation_start' | 'task_overdue'
  | 'heartbeat';

interface SseClient {
  organizationId: string;
  userId:         string;
  res:            Response;
  connectedAt:    Date;
}

// ─── Global event bus (org-scoped) ───────────────────────────────────────────

const bus = new EventEmitter();
bus.setMaxListeners(500);   // support many concurrent org connections

const clients = new Map<string, SseClient>();   // clientId → SseClient

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

// ─── Connection management ────────────────────────────────────────────────────

export function registerClient(
  clientId:       string,
  organizationId: string,
  userId:         string,
  res:            Response,
): void {
  // SSE headers
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');    // nginx: disable buffering
  res.flushHeaders();

  clients.set(clientId, { organizationId, userId, res, connectedAt: new Date() });

  // Send initial connection event
  sendToClient(clientId, 'connected', { message: 'SSE stream established', clientId });

  // Remove on disconnect
  res.on('close', () => {
    clients.delete(clientId);
    logger.debug({ clientId }, '[SSE] Client disconnected');
  });

  logger.debug({ clientId, organizationId }, '[SSE] Client connected');
}

function sendToClient(clientId: string, event: string, data: unknown): void {
  const client = clients.get(clientId);
  if (!client) return;
  try {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    clients.delete(clientId);
  }
}

// ─── Org broadcast ────────────────────────────────────────────────────────────

export function broadcast(
  organizationId: string,
  event:          SseEventType,
  data:           Record<string, unknown>,
): void {
  const payload = { ...data, _ts: new Date().toISOString() };
  for (const [clientId, client] of clients) {
    if (client.organizationId === organizationId) {
      sendToClient(clientId, event, payload);
    }
  }
}

// ─── Heartbeat ────────────────────────────────────────────────────────────────

export function startHeartbeat(): void {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    for (const clientId of clients.keys()) {
      sendToClient(clientId, 'heartbeat', { ts: new Date().toISOString() });
    }
  }, 25_000);
  logger.info('[SSE] Heartbeat started (25s interval)');
}

export function getConnectionCount(organizationId?: string): number {
  if (!organizationId) return clients.size;
  return [...clients.values()].filter(c => c.organizationId === organizationId).length;
}
