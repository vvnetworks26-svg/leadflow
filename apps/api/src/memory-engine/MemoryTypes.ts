/**
 * memory-engine/MemoryTypes.ts
 *
 * All domain types for Layer 6 — Memory Intelligence Engine.
 * No business logic. Types only.
 */

// ─── Memory domain ────────────────────────────────────────────────────────────

export type MemoryDomain =
  | 'identity'      // name, phone, email, address
  | 'relationship'  // booking history, past services, objections
  | 'preference'    // preferred time, communication style, urgency tolerance
  | 'business'      // company, industry, budget, timeline, decision-maker
  | 'behavioral'    // pain points, goals, objections, questions answered
  | 'property';     // service address, ZIP, equipment

// ─── Importance ───────────────────────────────────────────────────────────────

export type ImportanceLevel =
  | 'critical'   // 80–100: must never be lost (phone, name, booking)
  | 'high'       // 60–79:  very useful for future conversations
  | 'medium'     // 40–59:  helpful context
  | 'low'        // 20–39:  background detail
  | 'negligible';// 0–19:   can be discarded on compression

// ─── Retention policy ─────────────────────────────────────────────────────────

export type RetentionPolicy =
  | 'session'     // current session only
  | '30_days'
  | '90_days'
  | '1_year'
  | 'permanent';  // bookings, identity — never expire

// ─── Conflict strategy ────────────────────────────────────────────────────────

export type ConflictStrategy =
  | 'newest_wins'
  | 'highest_confidence_wins'
  | 'merge'
  | 'mark_uncertain'
  | 'require_revalidation';

// ─── Memory item ──────────────────────────────────────────────────────────────

export interface MemoryItem {
  readonly id:          string;
  readonly domain:      MemoryDomain;
  readonly key:         string;           // field name, e.g. "visitorName"
  readonly value:       unknown;          // typed by the domain classifier
  readonly confidence:  number;           // 0–100
  readonly importance:  ImportanceLevel;
  readonly importanceScore: number;       // 0–100 raw score
  readonly retention:   RetentionPolicy;
  readonly source:      'context' | 'regex' | 'llm' | 'user' | 'inferred';
  readonly needsRevalidation: boolean;
  readonly tags:        readonly string[];
  readonly createdAt:   string;           // ISO timestamp
}

// ─── Conflict ─────────────────────────────────────────────────────────────────

export interface MemoryConflict {
  readonly key:      string;
  readonly existing: MemoryItem;
  readonly incoming: MemoryItem;
  readonly strategy: ConflictStrategy;
}

export interface ConflictResolution {
  readonly resolved:    MemoryItem;
  readonly conflict:    MemoryConflict;
  readonly outcome:     'kept_existing' | 'took_incoming' | 'merged' | 'marked_uncertain';
}

// ─── Memory Profile ───────────────────────────────────────────────────────────

export interface MemoryProfile {
  readonly conversationId:   string;
  readonly organizationId:   string;
  readonly items:            readonly MemoryItem[];
  readonly conflicts:        readonly ConflictResolution[];
  readonly lowConfidenceKeys:readonly string[];
  readonly summary:          string;
  readonly generatedAt:      string;
}

// ─── Retrieval context ────────────────────────────────────────────────────────

export type RetrievalContext =
  | 'booking'
  | 'emergency'
  | 'sales'
  | 'support'
  | 'qualification'
  | 'returning_visitor'
  | 'general';

export interface RetrievalQuery {
  readonly context:     RetrievalContext;
  readonly maxItems?:   number;
  readonly minImportance?: ImportanceLevel;
}
