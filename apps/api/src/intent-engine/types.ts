/**
 * intent-engine/types.ts
 *
 * All types and enums for the Intent Understanding Engine (Layer 2).
 * Single source of truth — every module imports from here.
 * No business logic — types only.
 */

// ─── Intent taxonomy ──────────────────────────────────────────────────────────

/**
 * Top-level intent categories that apply across every service industry.
 * New intents are added here and in the keyword registry — no existing code changes.
 */
export type IntentCategory =
  | 'book_appointment'
  | 'request_estimate'
  | 'emergency_service'
  | 'repair'
  | 'installation'
  | 'maintenance'
  | 'inspection'
  | 'warranty'
  | 'existing_appointment'
  | 'reschedule'
  | 'cancel_appointment'
  | 'billing_question'
  | 'general_question'
  | 'employment'
  | 'complaint'
  | 'human_representative'
  | 'other'
  | 'unknown';

/** Finer-grained sub-category within an IntentCategory */
export type IntentSubCategory = string;   // open string — defined by registry

// ─── Confidence ───────────────────────────────────────────────────────────────

export type ConfidenceLevel =
  | 'very_high'    // ≥ 90
  | 'high'         // ≥ 70
  | 'medium'       // ≥ 50
  | 'low'          // ≥ 30
  | 'unknown';     // < 30

export type ConfidenceScore = number;   // 0–100, internal only — never exposed directly

// ─── Urgency ──────────────────────────────────────────────────────────────────

export type UrgencyLevel = 'normal' | 'priority' | 'emergency' | 'critical';

// ─── Entities ─────────────────────────────────────────────────────────────────

export type EntityType =
  | 'equipment'
  | 'service'
  | 'time'
  | 'address'
  | 'phone'
  | 'name'
  | 'city'
  | 'zip'
  | 'symptom'
  | 'other';

export interface ExtractedEntity {
  readonly type:  EntityType;
  readonly value: string;
  readonly raw:   string;   // original text fragment
}

// ─── Candidate intent (for ambiguity resolution) ─────────────────────────────

export interface IntentCandidate {
  readonly category:    IntentCategory;
  readonly subCategory: IntentSubCategory;
  readonly score:       ConfidenceScore;   // raw 0–100
  readonly signals:     readonly string[]; // keywords/patterns that fired
}

// ─── Resolved Intent aggregate ───────────────────────────────────────────────

/**
 * The immutable Intent aggregate produced by the engine.
 * Callers access confidence through `isCertain()`, `requiresClarification()`, etc.
 * The raw score is never exposed outside the engine boundary.
 */
export interface ResolvedIntent {
  readonly id:               string;        // UUID
  readonly category:         IntentCategory;
  readonly subCategory:      IntentSubCategory;
  readonly confidenceLevel:  ConfidenceLevel;
  readonly urgency:          UrgencyLevel;
  readonly detectedService:  string | null; // matched service name from catalog
  readonly entities:         readonly ExtractedEntity[];
  readonly candidates:       readonly IntentCandidate[];  // all competing intents
  readonly reasoning:        string;        // human-readable explanation
  readonly blueprintId:      string | null; // selected blueprint key
  readonly requiresHuman:    boolean;
  readonly requiresClarification: boolean;
  readonly rawMessage:       string;
  readonly timestamp:        Date;
}

// ─── Blueprint mapping ────────────────────────────────────────────────────────

/**
 * A blueprint mapping entry — defines which blueprint loads for a given
 * industry + intent combination. Config-driven; never hardcoded.
 */
export interface BlueprintMapping {
  readonly industry:    string;   // 'hvac' | 'plumbing' | '*' (wildcard)
  readonly intent:      IntentCategory;
  readonly blueprintId: string;
  readonly priority:    number;   // higher = preferred when multiple match
}

// ─── Keyword rule (for the rule-based classifier) ────────────────────────────

export interface IntentKeywordRule {
  readonly intent:      IntentCategory;
  readonly subCategory: IntentSubCategory;
  readonly keywords:    readonly string[];
  readonly phrases:     readonly string[];   // exact phrase matches (higher weight)
  readonly weight:      number;              // multiplier (default 1)
}

// ─── Analysis input / output ─────────────────────────────────────────────────

export interface IntentAnalysisInput {
  readonly message:        string;
  readonly organizationId: string;
  readonly industry:       string;
  readonly availableServices: readonly string[];  // from BusinessIdentity
  readonly conversationHistory?: readonly { role: 'user' | 'assistant'; content: string }[];
}

export interface IntentAnalysisResult {
  readonly intent:         ResolvedIntent;
  readonly clarificationQuestion: string | null;  // ask this if requiresClarification
}
