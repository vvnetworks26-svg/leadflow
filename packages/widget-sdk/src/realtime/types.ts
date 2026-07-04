/**
 * realtime/types.ts
 *
 * All types for the Realtime Layer.
 * Pure contracts — no implementation.
 */

// ─── Connection state ─────────────────────────────────────────────────────────

export type RealtimeState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed';

export interface ConnectionStatus {
  state:           RealtimeState;
  connectedAt:     string | null;
  disconnectedAt:  string | null;
  reconnectCount:  number;
}

// ─── Realtime message ─────────────────────────────────────────────────────────

export interface RealtimeMessage {
  readonly channel:   string;
  readonly event:     string;
  readonly data:      Readonly<Record<string, unknown>>;
  readonly timestamp: string;
  readonly id:        string;
}

// ─── Channel ─────────────────────────────────────────────────────────────────

export type MessageHandler = (message: RealtimeMessage) => void;

export interface RealtimeChannel {
  readonly name: string;
  /** Number of active subscriptions on this channel. */
  subscriptionCount(): number;
  /** Publish a message to all local subscribers. */
  publish(event: string, data: Record<string, unknown>): void;
  /** Broadcast to the adapter (future: sends to server). */
  broadcast(event: string, data: Record<string, unknown>): void;
}

// ─── Subscription ─────────────────────────────────────────────────────────────

export interface Subscription {
  readonly id:       string;
  readonly channel:  string;
  readonly handler:  MessageHandler;
  readonly createdAt: string;
  /** Unsubscribe this subscription. */
  unsubscribe(): void;
}

// ─── Heartbeat ────────────────────────────────────────────────────────────────

export interface HeartbeatStats {
  sent:       number;
  received:   number;
  lastSentAt:     string | null;
  lastReceivedAt: string | null;
}

// ─── Reconnect policy interface ──────────────────────────────────────────────

export interface ReconnectPolicy {
  readonly name: string;
  /** Returns the delay in ms before the next reconnect attempt. */
  nextDelayMs(attempt: number): number;
  /** Returns true when no more attempts should be made. */
  shouldStop(attempt: number): boolean;
}

// ─── Realtime adapter interface ───────────────────────────────────────────────

/**
 * Adapter abstraction — the realtime manager never owns a transport directly.
 *
 * Current: MockRealtimeAdapter (in-memory, no network)
 * Future:  WebSocketAdapter, SSEAdapter, WebTransportAdapter
 */
export interface RealtimeAdapter {
  readonly name: string;

  connect(): Promise<void>;
  disconnect(): void;
  send(channel: string, event: string, data: Record<string, unknown>): void;
  onMessage(handler: (msg: RealtimeMessage) => void): void;
  offMessage(handler: (msg: RealtimeMessage) => void): void;
  isConnected(): boolean;
}

// ─── Realtime diagnostics ─────────────────────────────────────────────────────

export interface RealtimeDiagnostics {
  connectionStatus:  RealtimeState;
  connectedAt:       string | null;
  reconnectCount:    number;
  heartbeatCount:    number;
  subscriptions:     string[];   // channel names of active subscriptions
  adapterType:       string;
}

// ─── Realtime manager interface ───────────────────────────────────────────────

export interface IRealtimeManager {
  connect(): Promise<void>;
  disconnect(): void;
  subscribe(channel: string, handler: MessageHandler): Subscription;
  unsubscribe(subscriptionId: string): void;
  publish(channel: string, event: string, data: Record<string, unknown>): void;
  broadcast(channel: string, event: string, data: Record<string, unknown>): void;
  getStatus(): ConnectionStatus;
  getDiagnostics(): RealtimeDiagnostics;
}
