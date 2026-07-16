/**
 * ai/types.ts
 *
 * All shared types for the AI conversation engine.
 * Single source of truth — every other AI module imports from here.
 */

// ─── Conversation state machine ───────────────────────────────────────────────

export type ConversationStage =
  | 'greeting'
  | 'discovery'
  | 'qualification'
  | 'recommendation'
  | 'objection'
  | 'booking'
  | 'completed'
  | 'escalated';

// ─── Intent classification ────────────────────────────────────────────────────

export type IntentType =
  | 'Greeting'
  | 'Question'
  | 'Pricing'
  | 'Feature'
  | 'LeadFlow'
  | 'Website'
  | 'Automation'
  | 'Support'
  | 'Technical'
  | 'Booking'
  | 'Demo'
  | 'Objection'
  | 'Comparison'
  | 'Unknown';

export interface DetectedIntent {
  intent:     IntentType;
  confidence: number;           // 0–100
  subIntents: IntentType[];     // secondary signals
  rawText:    string;
}

// ─── Lead qualification ───────────────────────────────────────────────────────

export type LeadTemperature = 'Hot' | 'Warm' | 'Cold' | 'Disqualified';

export interface QualificationScore {
  overall:          number;          // 0–100
  temperature:      LeadTemperature;
  confidence:       number;          // 0–100
  breakdown: {
    industry:         number;
    companySize:      number;
    decisionMaker:    number;
    budget:           number;
    timeline:         number;
    urgency:          number;
    technicalReady:   number;
    aiReady:          number;
    painSeverity:     number;
    buyingIntent:     number;
  };
  reasons:          string[];
  missingInfo:      string[];
}

// ─── Conversation memory ──────────────────────────────────────────────────────

export interface ConversationMemory {
  // Visitor identity
  visitorName:      string | null;
  company:          string | null;
  industry:         string | null;
  location:         string | null;
  employeeCount:    string | null;

  // Commercial profile
  painPoints:       string[];
  goals:            string[];
  budget:           string | null;
  timeline:         string | null;
  decisionMaker:    boolean | null;

  // Conversation tracking
  servicesDiscussed:  string[];
  questionsAnswered:  string[];
  objections:         string[];
  bookingStatus:      'none' | 'requested' | 'booked';
  demoRequested:      boolean;
  phone:              string | null;
  email:              string | null;

  // AI metadata
  summary:          string | null;
  lastUpdated:      string;         // ISO timestamp
}

export function emptyMemory(): ConversationMemory {
  return {
    visitorName:      null,
    company:          null,
    industry:         null,
    location:         null,
    employeeCount:    null,
    painPoints:       [],
    goals:            [],
    budget:           null,
    timeline:         null,
    decisionMaker:    null,
    servicesDiscussed:[],
    questionsAnswered:[],
    objections:       [],
    bookingStatus:    'none',
    demoRequested:    false,
    phone:            null,
    email:            null,
    summary:          null,
    lastUpdated:      new Date().toISOString(),
  };
}

// ─── Knowledge base ───────────────────────────────────────────────────────────

export type KnowledgeCategory =
  | 'Services'
  | 'Pricing'
  | 'FAQ'
  | 'Integrations'
  | 'CaseStudies'
  | 'Policies'
  | 'Technical'
  | 'Company';

export interface KnowledgeEntry {
  id:         string;
  category:   KnowledgeCategory;
  title:      string;
  content:    string;
  tags:       string[];
  relevance?: number;           // populated by search
}

// ─── Recommendation ───────────────────────────────────────────────────────────

export type ProductType =
  | 'LeadFlow'
  | 'WebsiteAutomation'
  | 'CustomSoftware'
  | 'AIAgent'
  | 'CRMIntegration'
  | 'MarketingAutomation'
  | 'DataAnalytics';

export interface Recommendation {
  product:    ProductType;
  title:      string;
  why:        string;           // why it's relevant to this lead
  fitScore:   number;           // 0–100
  urgency:    'high' | 'medium' | 'low';
}

// ─── Tool calling ─────────────────────────────────────────────────────────────

export type ToolName =
  | 'lookupBusiness'
  | 'lookupServices'
  | 'lookupPricing'
  | 'lookupFAQ'
  | 'lookupCaseStudies'
  | 'lookupIntegrations'
  | 'lookupAvailability'
  | 'bookAppointment'
  | 'createLead'
  | 'updateLead'
  | 'searchKnowledge'
  | 'summarizeConversation';

export interface ToolCall {
  tool:   ToolName;
  params: Record<string, unknown>;
}

export interface ToolResult<T = unknown> {
  tool:    ToolName;
  success: boolean;
  data:    T;
  error?:  string;
}

// ─── Guardrail ────────────────────────────────────────────────────────────────

export interface GuardrailResult {
  passed:  boolean;
  reason?: string;             // populated when blocked
  safe:    boolean;
}

// ─── Analytics event ──────────────────────────────────────────────────────────

export type AIAnalyticsEventType =
  | 'message_received'
  | 'intent_classified'
  | 'stage_transition'
  | 'lead_qualified'
  | 'recommendation_shown'
  | 'booking_triggered'
  | 'tool_called'
  | 'conversation_summarized'
  | 'guardrail_blocked'
  | 'conversation_dropped';

export interface AIAnalyticsEvent {
  eventType:      AIAnalyticsEventType;
  organizationId: string;
  conversationId: string;
  payload:        Record<string, unknown>;
  timestamp:      string;
}

// ─── v2: Confidence-tracked memory field ─────────────────────────────────────

/**
 * Wraps a single memory value with provenance metadata.
 * Enables the merge engine to keep higher-confidence values
 * and prevents the AI from asking for already-known information.
 */
export interface MemoryField<T = string> {
  value:      T | null;
  confidence: number;                                // 0–100
  source:     'context' | 'regex' | 'llm' | 'user' | null;
}

// ─── v2: Conversation progress tracker ───────────────────────────────────────

/**
 * Boolean flags that track which pieces of information have been collected.
 * The planner uses these to determine what to ask next.
 * Updated automatically whenever memory is updated.
 */
export interface ConversationProgress {
  visitorNameCollected:  boolean;
  companyCollected:      boolean;
  phoneCollected:        boolean;
  emailCollected:        boolean;
  addressCollected:      boolean;
  painCollected:         boolean;
  budgetCollected:       boolean;
  timelineCollected:     boolean;
  appointmentCollected:  boolean;
  serviceCollected:      boolean;
  emergencyCollected:    boolean;
}

export function emptyProgress(): ConversationProgress {
  return {
    visitorNameCollected:  false,
    companyCollected:      false,
    phoneCollected:        false,
    emailCollected:        false,
    addressCollected:      false,
    painCollected:         false,
    budgetCollected:       false,
    timelineCollected:     false,
    appointmentCollected:  false,
    serviceCollected:      false,
    emergencyCollected:    false,
  };
}

// ─── v2: Conversation planner output ─────────────────────────────────────────

export interface ConversationPlan {
  nextGoal:      string;    // human-readable goal, e.g. "collect phone number"
  questionToAsk: string;    // ready-to-use question string
  priority:      'critical' | 'high' | 'medium' | 'low';
  fieldTargeted: keyof ConversationProgress | null;
}

// ─── v2: Rich memory (additive superset of ConversationMemory) ────────────────

/**
 * Extends the flat ConversationMemory with per-field confidence tracking.
 * The flat fields remain for backward compatibility (MongoDB schema unchanged).
 * The `rich` namespace is the authoritative source; flat fields are synced from it.
 */
export interface RichConversationMemory extends ConversationMemory {
  rich: {
    visitorName:   MemoryField<string>;
    company:       MemoryField<string>;
    phone:         MemoryField<string>;
    email:         MemoryField<string>;
    address:       MemoryField<string>;
    zip:           MemoryField<string>;
    industry:      MemoryField<string>;
    employeeCount: MemoryField<string>;
    budget:        MemoryField<string>;
    timeline:      MemoryField<string>;
    service:       MemoryField<string>;
    emergency:     MemoryField<boolean>;
    preferredTime: MemoryField<string>;
  };
  progress: ConversationProgress;
}

export function emptyRichMemory(): RichConversationMemory {
  const f = <T = string>(): MemoryField<T> => ({ value: null, confidence: 0, source: null });
  return {
    // Flat ConversationMemory fields (unchanged for MongoDB compat)
    visitorName:      null,
    company:          null,
    industry:         null,
    location:         null,
    employeeCount:    null,
    painPoints:       [],
    goals:            [],
    budget:           null,
    timeline:         null,
    decisionMaker:    null,
    servicesDiscussed:[],
    questionsAnswered:[],
    objections:       [],
    bookingStatus:    'none',
    demoRequested:    false,
    phone:            null,
    email:            null,
    summary:          null,
    lastUpdated:      new Date().toISOString(),
    // Rich fields
    rich: {
      visitorName:   f<string>(),
      company:       f<string>(),
      phone:         f<string>(),
      email:         f<string>(),
      address:       f<string>(),
      zip:           f<string>(),
      industry:      f<string>(),
      employeeCount: f<string>(),
      budget:        f<string>(),
      timeline:      f<string>(),
      service:       f<string>(),
      emergency:     f<boolean>(),
      preferredTime: f<string>(),
    },
    progress: emptyProgress(),
  };
}

// ─── Orchestrator I/O ─────────────────────────────────────────────────────────

export interface ChatMessage {
  role:    'user' | 'assistant';
  content: string;
}

export interface OrchestratorInput {
  organizationId: string;
  conversationId: string;
  userMessage:    string;
  history:        ChatMessage[];
  memory:         ConversationMemory;
  stage:          ConversationStage;
  currentPage?:   string;
  // v2 additions (optional — populated by orchestrator internally)
  industry?:      string;
  progress?:      ConversationProgress;
  plan?:          ConversationPlan;
}

export interface OrchestratorOutput {
  reply:           string;
  updatedMemory:   ConversationMemory;
  updatedStage:    ConversationStage;
  intent:          DetectedIntent;
  qualification:   QualificationScore;
  recommendations: Recommendation[];
  toolsUsed:       ToolResult[];
  bookingTriggered:boolean;
  summary?:        string;
  analyticsEvents: AIAnalyticsEvent[];
}
