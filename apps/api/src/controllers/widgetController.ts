/**
 * widgetController.ts
 *
 * Public-facing widget endpoints.
 * No authentication required — the widget token (businessId / org slug)
 * identifies the organization. All created records are automatically
 * scoped to that organization.
 *
 * Security: these endpoints are rate-limited and only allow create operations
 * for leads and conversations — no reads, no deletes.
 */

import { Request, Response, NextFunction } from 'express';
import { randomBytes, randomUUID } from 'crypto';
import { OrganizationModel }   from '../models/Organization.model';
import { AppointmentModel }    from '../models/Appointment.model';
import { LeadService }         from '../services/LeadService';
import { ConversationService } from '../services/ConversationService';
import { AppointmentService }  from '../services/AppointmentService';
import { ApiError }            from '../middleware/errorHandler';
import { AvailabilityService, BookingRulesService, CalendarProviderRegistry } from '../booking-engine';
import { localToUtcIso }       from '../booking-engine/TimezoneService';
import type { BlockedSlot, AvailabilityRequest } from '../booking-engine/types';
import { CreateLeadSchema }    from '../dto/lead.dto';
import { CreateConversationSchema } from '../dto/conversation.dto';
import { runOrchestrator }     from '../ai/orchestrator';
import { AIConversationSessionModel } from '../models/AIConversationSession.model';
import { emptyMemory }         from '../ai/types';
import { memoryToRich }        from '../ai/memory';
import { qualifyLead }         from '../ai/qualification';
import { makeEvent, persistEvents } from '../ai/analytics';
import { AutomationService }   from '../crm/automation/AutomationService';
import { ConversationOrchestrationService } from '../conversation-engine/ConversationOrchestrationService';
import { ToolGuards }          from '../tool-orchestration/ToolGuards';
import { BusinessIdentityService } from '../business-identity/BusinessIdentityService';
import { enqueueConversationSummary } from '../ai/pipeline/ConversationSummaryQueue';
import { logger }              from '../utils/logger';
import { z }                   from 'zod';
import type { ConversationStage, ConversationMemory } from '../ai/types';
import type { AppointmentType }   from '../types';
import type { ConversationObjective, WorkflowState } from '../conversation-engine/types';
import type { ToolCall, ToolSelectionContext } from '../tool-orchestration/types';
import type { ResolvedIntent } from '../intent-engine/types';
import type { BusinessIdentity } from '../business-identity/types';

/** Resolve organizationId from a widget token (org slug or org ID). */
async function resolveOrg(token: string): Promise<string> {
  // Try slug first, then fall back to _id
  const org =
    await OrganizationModel.findOne({ slug: token, status: 'active' }) ??
    await OrganizationModel.findOne({ _id: token,  status: 'active' }).catch(() => null);

  if (!org) throw new ApiError(404, 'Organization not found', 'ORG_NOT_FOUND');
  return org.id as string;
}

/**
 * POST /api/v1/widget/:token/session
 * Creates a new widget session with server-generated identifiers.
 * Client must never supply widgetSessionId or conversationId — both are
 * generated server-side. Verifies REQ-2, REQ-11.1, REQ-11.3, REQ-13.1.
 */
export async function widgetCreateSession(req: Request, res: Response, next: NextFunction) {
  try {
    // Reject client-supplied session identifiers (REQ-11.1)
    if ('widgetSessionId' in req.body || 'conversationId' in req.body) {
      return res.status(422).json({
        status:  'error',
        code:    'VALIDATION_ERROR',
        message: 'Session identifiers must not be supplied by the client',
      });
    }

    // Resolve organization from token — 404 on failure (REQ-2.4)
    const organizationId = await resolveOrg(req.params.token);

    // Generate both IDs server-side (REQ-2.2, REQ-2.3)
    const widgetSessionId = randomUUID();
    const conversationId  = randomUUID();

    // Persist the new session document (REQ-2.1)
    await AIConversationSessionModel.create({
      widgetSessionId,
      conversationId,
      organizationId,
      status:        'active',
      seq:           0,
      schemaVersion: 1,
      stage:         'greeting' as ConversationStage,
      memory:        emptyMemory(),
      history:       [],
      turnCount:     0,
      lastActivity:  new Date(),
    });

    // Emit session_created analytics event (REQ-13.1)
    persistEvents([
      makeEvent('session_created', organizationId, conversationId, {
        widgetSessionId,
        organizationId,
        source: 'widget',
      }),
    ]);

    // Return only safe fields — never conversationId or organizationId (REQ-11.3)
    return res.status(201).json({
      status: 'ok',
      data: {
        widgetSessionId,
        schemaVersion: 1,
        stage:         'greeting',
        turnCount:     0,
      },
    });
  } catch (e) { next(e); }
}

// UUID v4 regex (REQ-11.4)
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// 48-hour expiry threshold in milliseconds (REQ-3.3)
const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

/**
 * GET /api/v1/widget/:token/session/:widgetSessionId
 * Returns conversation state for hydration.
 * Verifies REQ-3, REQ-11.2, REQ-11.3, REQ-11.4, REQ-11.5, REQ-13.2.
 */
export async function widgetGetSession(req: Request, res: Response, next: NextFunction) {
  try {
    const { widgetSessionId } = req.params;

    // Validate UUID v4 format before any DB query (REQ-11.4, REQ-3.4)
    if (!UUID_V4_RE.test(widgetSessionId)) {
      return res.status(422).json({
        status:  'error',
        code:    'INVALID_SESSION_ID',
        message: 'widgetSessionId must be a valid UUID v4',
      });
    }

    // Resolve organization from token — 404 on failure (REQ-11.2)
    const organizationId = await resolveOrg(req.params.token);

    // Query using compound index { widgetSessionId, organizationId } (REQ-11.5)
    // Implicitly enforces org ownership — returns null on cross-tenant mismatch (REQ-11.2)
    const session = await AIConversationSessionModel
      .findOne({ widgetSessionId, organizationId })
      .lean();

    // 404 if document not found or org mismatch (REQ-3.2, REQ-11.2)
    if (!session) {
      return res.status(404).json({
        status:  'error',
        code:    'SESSION_NOT_FOUND',
        message: 'Session not found',
      });
    }

    // 410 if session has been inactive for more than 48 hours (REQ-3.3)
    const isExpired = session.lastActivity < new Date(Date.now() - FORTY_EIGHT_HOURS_MS);
    if (isExpired) {
      return res.status(410).json({
        status:  'error',
        code:    'SESSION_EXPIRED',
        message: 'Session has expired',
      });
    }

    // Emit session_resumed event only when turnCount > 0 (REQ-13.2)
    if (session.turnCount > 0) {
      persistEvents([
        makeEvent('session_resumed', organizationId, session.conversationId, {
          widgetSessionId: session.widgetSessionId,
          turnCount:       session.turnCount,
          lastActivity:    session.lastActivity.toISOString(),
        }),
      ]);
    }

    // Derive safe display fields — never expose full memory blob (REQ-11.3, REQ-3.5)
    const memory = session.memory as any;
    const displayName: string | null = memory?.visitorName ?? null;
    const isReturning = session.turnCount > 0;

    // Cap history at last 20 messages (design §3.2)
    const history = (session.history ?? []).slice(-20);

    // Return hydration payload — no _id, organizationId, conversationId, memory, qualification, rich (REQ-11.3)
    return res.status(200).json({
      status: 'ok',
      data: {
        widgetSessionId: session.widgetSessionId,
        schemaVersion:   session.schemaVersion,
        stage:           session.stage,
        turnCount:       session.turnCount,
        lastActivity:    session.lastActivity,
        isReturning,
        progress:        session.progress,
        history,
        displayName,
      },
    });
  } catch (e) { next(e); }
}

/**
 * DELETE /api/v1/widget/:token/session/:widgetSessionId
 * Archives a widget session (never hard-deletes via this endpoint).
 * Only archives sessions that exist, belong to the resolved org, and are not
 * already archived — if any of those conditions fail it is a 404.
 * Verifies REQ-4.
 */
export async function widgetDeleteSession(req: Request, res: Response, next: NextFunction) {
  try {
    const { widgetSessionId } = req.params;

    // Validate UUID v4 format before any DB query (REQ-11.4, REQ-4)
    if (!UUID_V4_RE.test(widgetSessionId)) {
      return res.status(422).json({
        status:  'error',
        code:    'INVALID_SESSION_ID',
        message: 'widgetSessionId must be a valid UUID v4',
      });
    }

    // Resolve organization from token — 404 on failure
    const organizationId = await resolveOrg(req.params.token);

    // Archive the session atomically.
    // Filter { widgetSessionId, organizationId, status: { $ne: 'archived' } } ensures:
    //   - The session belongs to this org (cross-tenant protection, REQ-11.2)
    //   - The session exists and is not already archived (REQ-4.3)
    // If the document doesn't exist or is already archived this returns null → 404.
    let updated;
    try {
      updated = await AIConversationSessionModel.findOneAndUpdate(
        { widgetSessionId, organizationId, status: { $ne: 'archived' } },
        { $set: { status: 'archived' } },
        { new: true },
      );
    } catch (dbErr) {
      // DB write failure → 500 INTERNAL_ERROR (REQ-4.4)
      return res.status(500).json({
        status:  'error',
        code:    'INTERNAL_ERROR',
        message: 'Failed to archive session',
      });
    }

    // If no document was matched (not found or wrong org) → 404 SESSION_NOT_FOUND (REQ-4.2)
    if (!updated) {
      return res.status(404).json({
        status:  'error',
        code:    'SESSION_NOT_FOUND',
        message: 'Session not found',
      });
    }

    // Trigger point (b) for the async conversation-summary pipeline — the
    // widget closing is a real "conversation ended" signal. jobId dedup
    // (keyed by conversationId) collapses this with trigger (a) if the
    // orchestrator already enqueued one for this session.
    enqueueConversationSummary(updated.conversationId, organizationId).catch(err => {
      logger.warn({ err, conversationId: updated.conversationId, organizationId }, '[widgetDeleteSession] Failed to enqueue conversation summary job');
    });

    // Successfully archived — return 200 { status: 'ok' } (REQ-4.1)
    return res.status(200).json({ status: 'ok' });
  } catch (e) { next(e); }
}

/**
 * GET /api/v1/widget/:token/config
 * Returns the public widget configuration for an organization.
 */
export async function getWidgetConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const orgId = await resolveOrg(req.params.token);
    const org   = await OrganizationModel.findById(orgId);
    if (!org) throw new ApiError(404, 'Organization not found', 'ORG_NOT_FOUND');

    res.json({
      status: 'ok',
      data: {
        organizationId: org.id,
        name:           org.name,
        slug:           org.slug,
        industry:       org.industry,
        timezone:       org.timezone,
      },
    });
  } catch (e) { next(e); }
}

const WidgetAvailabilityQuerySchema = z.object({
  duration:     z.coerce.number().int().min(15).max(480).optional().default(60),
  // Accepted for forward-compatibility with the widget's request shape, but
  // not currently used to filter slots — no natural-language date parser
  // exists server-side yet. The full window (today .. maximumBookingDays)
  // is always returned.
  preferredDay: z.string().optional(),
});

/**
 * GET /api/v1/widget/:token/availability
 *
 * Returns open appointment slots for an organization, reusing the same
 * booking-engine (Layer 8) slot generation the authenticated dashboard
 * booking flow and the conversation orchestrator both rely on — no
 * separate availability logic is maintained here.
 *
 * No JWT required — the organization is identified by the widget token.
 * Existing (non-canceled) appointments in the window are loaded and passed
 * in as blocked slots so already-booked times are excluded.
 *
 * A org with no Business document (BusinessIdentityService.load() returns
 * null — see business-identity/BusinessIdentityService.ts) gets a clean
 * 404 with an explicit code, same pattern as getWidgetConfig() above —
 * never a crash from reading businessHours/bookingRules off a null identity.
 */
export async function widgetGetAvailability(req: Request, res: Response, next: NextFunction) {
  try {
    const result = WidgetAvailabilityQuerySchema.safeParse(req.query);
    if (!result.success) {
      const msg = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new ApiError(422, msg, 'VALIDATION_ERROR');
    }
    const { duration } = result.data;

    const orgId    = await resolveOrg(req.params.token);
    const identity = await BusinessIdentityService.load(orgId);
    if (!identity) throw new ApiError(404, 'Business identity not found', 'ORG_IDENTITY_NOT_FOUND');

    const nowMs      = Date.now();
    const timezone   = identity.contactInfo.timezone;
    const startDate  = new Date(nowMs).toISOString().slice(0, 10);
    const windowDays = identity.bookingRules.maximumBookingDays ?? 14;
    const endDate    = new Date(nowMs + windowDays * 86_400_000).toISOString().slice(0, 10);

    // Existing appointments in the window become blocked slots so the
    // generator doesn't offer times that are already taken.
    const existing = await AppointmentModel.find({
      organizationId: orgId,
      status:         { $ne: 'Canceled' },
      date:           { $gte: startDate, $lte: endDate },
    }).lean();

    const blockedSlots: BlockedSlot[] = existing.map(a => {
      const startUtc = localToUtcIso(a.date, a.time, timezone);
      const endUtc   = new Date(new Date(startUtc).getTime() + (a.duration ?? 60) * 60_000).toISOString();
      return { startUtc, endUtc, reason: 'booked' };
    });

    // Mirrors BookingEngine.getAvailability's internals, but calls
    // AvailabilityService directly so the widget's requested `duration` can
    // override the catalog/default lookup — GetAvailabilityOptions only
    // supports duration via service-name matching (AvailabilityRequest's
    // own durationMinutes field is explicitly documented as an "override
    // catalog duration" escape hatch for exactly this).
    // A chat SlotPicker is a numbered list of buttons, not a calendar:
    // dumping hundreds of slots into one chat bubble is unusable. Cap to the
    // nearest MAX_WIDGET_SLOTS, soonest first — the AI's own framing ("Here
    // are our next available times") already sets the expectation of a short
    // list, not an exhaustive one. Passed as maxSlots below so SlotGenerator
    // stops walking the org's full maximumBookingDays window (90 days by
    // default) once it has enough — this bounds what's COMPUTED, not just
    // what's returned. Without it, a single request generates every open
    // slot across the full window (1,000+ for a typical org) only to throw
    // away all but 10 of them.
    const MAX_WIDGET_SLOTS = 10;

    const effectiveRules = BookingRulesService.forRequest(identity, '', false);
    const availabilityReq: AvailabilityRequest = {
      organizationId:  identity.organizationId,
      businessHours:   identity.businessHours,
      bookingRules:    BookingRulesService.toBookingRulesShape(effectiveRules),
      timezone,
      durationMinutes: duration,
      blockedSlots,
      startDateUtc:    startDate,
      endDateUtc:      endDate,
      nowMs,
      maxSlots:        MAX_WIDGET_SLOTS,
    };
    const availability = await AvailabilityService.getSlots(availabilityReq, CalendarProviderRegistry.default());

    // Map the booking-engine's AppointmentSlot shape to the widget's TimeSlot
    // shape — the same date/time/displayDate/displayTime fields WidgetBookSchema
    // (POST /:token/book) accepts, so a selected slot can be posted straight through.
    // The slice is now a no-op in practice (maxSlots already bounded the
    // array) — kept as a defensive guarantee on the response shape.
    const slots = availability.slots.slice(0, MAX_WIDGET_SLOTS).map(s => {
      const [displayDate, displayTime] = s.displayLabel.split(' at ');
      return {
        date:        s.startLocal.slice(0, 10),
        time:        s.startLocal.slice(11, 16),
        displayDate: displayDate ?? s.displayLabel,
        displayTime: displayTime ?? '',
        available:   s.available,
      };
    });

    res.json({ status: 'ok', data: slots });
  } catch (e) { next(e); }
}

/**
 * POST /api/v1/widget/:token/leads
 * Widget creates a lead for an organization.
 * organizationId is resolved from the token — never trusted from the body.
 */
export async function widgetCreateLead(req: Request, res: Response, next: NextFunction) {
  try {
    const result = CreateLeadSchema.safeParse(req.body);
    if (!result.success) {
      const msg = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new ApiError(422, msg, 'VALIDATION_ERROR');
    }

    const orgId = await resolveOrg(req.params.token);
    const lead  = await LeadService.create(orgId, { ...result.data, source: result.data.source || 'widget' });
    res.status(201).json({ status: 'ok', data: lead });
  } catch (e) { next(e); }
}

/**
 * POST /api/v1/widget/:token/conversations
 * Widget creates a conversation for an organization.
 */
export async function widgetCreateConversation(req: Request, res: Response, next: NextFunction) {
  try {
    const result = CreateConversationSchema.safeParse(req.body);
    if (!result.success) {
      const msg = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new ApiError(422, msg, 'VALIDATION_ERROR');
    }

    const orgId        = await resolveOrg(req.params.token);
    const conversation = await ConversationService.create(orgId, result.data);
    res.status(201).json({ status: 'ok', data: conversation });
  } catch (e) { next(e); }
}

const MAX_WIDGET_HISTORY = 30;

/**
 * POST /api/v1/widget/:token/chat
 * Unauthenticated widget conversation turn.
 * The token resolves the organization — no JWT required.
 *
 * Accepts both legacy body shape `{ message, conversationId, currentPage }` and the
 * new shape `{ message, widgetSessionId, messageType, currentPage }`.
 * When `widgetSessionId` is present it takes precedence over `conversationId` for
 * session lookup; when absent the handler falls back to the existing `conversationId`
 * path so all existing callers continue to work without changes (REQ-14.2).
 *
 * `messageType` replaces the `__init__` / `__resume__` sentinel strings (design §3.4):
 *   - 'greeting' → same as `message === '__init__'`: skip user history entry
 *   - 'resume'   → inject '__resume__' as the userMessage so the orchestrator can
 *                  generate a personalised resumption greeting (Task 9 handles the
 *                  orchestrator side); no user history entry stored
 *   - 'message'  → normal turn (default when messageType is absent)
 *
 * The legacy `__init__` sentinel string is still detected for backward compat:
 *   isInit = message.trim() === '__init__' || messageType === 'greeting'
 *
 * Verifies: REQ-7.3, REQ-14.2, design §3.4
 */
export async function widgetChat(req: Request, res: Response, next: NextFunction) {
  try {
    const {
      message,
      conversationId,
      widgetSessionId,
      messageType,
      currentPage,
    } = req.body as {
      message:          string;
      conversationId?:  string;
      widgetSessionId?: string;
      messageType?:     'greeting' | 'resume' | 'message';
      currentPage?:     string;
    };

    if (!message || !message.trim()) throw new ApiError(422, 'message is required', 'VALIDATION_ERROR');

    // When neither identifier is present the request is invalid (legacy requirement).
    if (!widgetSessionId && !conversationId) {
      throw new ApiError(422, 'conversationId is required', 'VALIDATION_ERROR');
    }

    const orgId = await resolveOrg(req.params.token);

    // ── Session lookup ─────────────────────────────────────────────────────────
    // Path A (new): widgetSessionId present → compound-index lookup (REQ-11.5).
    // Path B (legacy): widgetSessionId absent → conversationId lookup (REQ-14.2).
    let session;

    if (widgetSessionId) {
      // New path: look up via { widgetSessionId, organizationId } compound index.
      session = await AIConversationSessionModel.findOne({ widgetSessionId, organizationId: orgId });

      if (!session) {
        // Session was created via POST /session but not found — treat as error.
        throw new ApiError(404, 'Session not found', 'SESSION_NOT_FOUND');
      }
    } else {
      // Legacy path: unchanged behaviour — load or lazily create by conversationId.
      session = await AIConversationSessionModel.findOne({ conversationId, organizationId: orgId });
      if (!session) {
        session = await AIConversationSessionModel.create({
          organizationId: orgId,
          conversationId,
          stage:          'greeting' as ConversationStage,
          memory:         emptyMemory(),
          history:        [],
          qualification:  null,
          turnCount:      0,
          lastActivity:   new Date(),
        });
      }
    }

    // ── Sentinel / messageType mapping ─────────────────────────────────────────
    /**
     * isInit  — true for the opening greeting turn: no user history entry is stored.
     * isResume — true for the resume sentinel: inject '__resume__' so the orchestrator
     *            (Task 9) can generate a personalised returning-visitor greeting;
     *            also skips the user history entry.
     *
     * Legacy __init__ string is still honoured for backward compat (REQ-14.2):
     *   isInit = message.trim() === '__init__' || messageType === 'greeting'
     */
    const isInit   = message.trim() === '__init__' || messageType === 'greeting';
    const isResume = messageType === 'resume';

    // Derive the message to pass to the orchestrator.
    let userMessage: string;
    if (isResume) {
      userMessage = '__resume__';   // Task 9 will handle this sentinel in runOrchestrator
    } else if (isInit) {
      userMessage = 'Hello';
    } else {
      userMessage = message.trim();
    }

    // The conversationId the orchestrator receives comes from the session document
    // (never blindly from the client), keeping internal identifiers server-authoritative.
    const sessionConversationId = session.conversationId;

    const output = await runOrchestrator({
      organizationId: orgId,
      conversationId: sessionConversationId,
      userMessage,
      history:        session.history,
      memory:         session.memory as any ?? emptyMemory(),
      stage:          (session.stage as ConversationStage) ?? 'greeting',
      currentPage,
      currentObjective:   session.currentObjective   ?? null,
      workflowState:      session.workflowState      ?? null,
      currentBlueprintId: session.currentBlueprintId ?? null,
    });

    // ── History append ─────────────────────────────────────────────────────────
    // For init and resume turns only store the assistant reply — no user turn.
    // For real messages, store both sides.
    const isSilentTurn = isInit || isResume;
    const newHistory = [
      ...session.history,
      ...(isSilentTurn
        ? [{ role: 'assistant' as const, content: output.reply }]
        : [
            { role: 'user' as const,      content: message },
            { role: 'assistant' as const, content: output.reply },
          ]
      ),
    ].slice(-MAX_WIDGET_HISTORY);

    await AIConversationSessionModel.findByIdAndUpdate(session._id, {
      stage:              output.updatedStage,
      memory:             output.updatedMemory,
      history:            newHistory,
      qualification:      output.qualification,
      turnCount:          session.turnCount + 1,
      lastActivity:       new Date(),
      currentObjective:   output.updatedObjective,
      workflowState:      output.updatedWorkflowState,
      currentBlueprintId: output.updatedBlueprintId,
    });

    // Response schema is additive-only over REQ-14.2's shape: visitorName is
    // a new field, nothing existing changed. Lets the frontend know whether
    // the AI has already captured a name so the booking sub-flow doesn't
    // ask twice — see widgetBook() below, which is the actual source of truth.
    res.json({
      status: 'ok',
      data: {
        reply:            output.reply,
        stage:            output.updatedStage,
        bookingTriggered: output.bookingTriggered,
        visitorName:      output.updatedMemory.visitorName ?? null,
      },
    });
  } catch (e) { next(e); }
}

// ─── Booking input schema ─────────────────────────────────────────────────────

const WidgetBookSchema = z.object({
  // Visitor identity — NOT trusted as-is. Phone is never accepted from the
  // client at all: the stage gate below guarantees session.memory.phone is
  // already populated by the time booking is reachable (every blueprint
  // that exposes book_appointment requires phoneCollected first — see
  // conversation-engine/blueprints/default-blueprints.ts). customerName is
  // accepted here only as the fallback the widget's collectName sub-flow
  // sends when the AI never asked for a name (the emergency-triage paths
  // gate on phone only) — see widgetBook() below for how these are resolved
  // against session.memory. Trusting a client-supplied phone unconditionally
  // is exactly how placeholder/fake contact data got persisted before this.
  customerName:  z.string().min(1).trim().optional(),
  email:         z.string().email().optional(),
  address:       z.string().optional().default('Not provided'),
  zipCode:       z.string().optional(),

  // Service details
  service:       z.string().min(1).trim(),
  emergency:     z.boolean().optional().default(false),
  hvacNeed:      z.string().optional(),    // alias for service on the lead

  // Slot details
  date:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  time:          z.string().regex(/^\d{2}:\d{2}$/, 'time must be HH:MM'),
  displayDate:   z.string().optional().default(''),
  displayTime:   z.string().optional().default(''),
  duration:      z.number().int().min(15).optional().default(60),

  // Optional enrichment
  preferredDay:        z.string().optional(),
  qualificationReason: z.string().optional(),
  status:              z.string().optional().default('New'),
  priority:            z.string().optional().default('Medium'),
  value:               z.number().min(0).optional().default(0),
  notes:               z.string().optional(),

  // A booking must reference a real, existing session — the client-supplied
  // conversationId field this used to accept is gone; the conversationId used
  // internally always comes from the looked-up session document instead
  // (never trusted from the client — same principle as widgetChat()).
  widgetSessionId: z.string().regex(UUID_V4_RE, 'widgetSessionId must be a valid UUID v4'),

  // Chat messages to store on the conversation
  messages: z.array(z.object({
    id:        z.string(),
    sender:    z.enum(['ai', 'user', 'agent']),
    text:      z.string(),
    timestamp: z.string(),
  })).optional().default([]),
});

// ─── ToolGuards context placeholder ────────────────────────────────────────────

/**
 * A booking-form submission has no "current message" to classify — there's
 * no real ResolvedIntent for this action. guardBookAppointment (the only
 * guard wired into widgetBook()) does not read ctx.intent at all, so this
 * exists purely to satisfy ToolSelectionContext's type structurally. If a
 * future guard change starts reading ctx.intent, replace this with real
 * classification instead of extending the placeholder.
 */
const NO_CURRENT_MESSAGE_INTENT: ResolvedIntent = {
  id: 'widget-book-no-message',
  category: 'book_appointment',
  subCategory: '',
  confidenceLevel: 'unknown',
  urgency: 'normal',
  detectedService: null,
  entities: [],
  candidates: [],
  reasoning: 'No message — booking form submission, not a chat turn.',
  blueprintId: null,
  requiresHuman: false,
  requiresClarification: false,
  rawMessage: '',
  timestamp: new Date(),
};

// ─── Appointment type inference ───────────────────────────────────────────────

function inferType(service: string, emergency: boolean): AppointmentType {
  if (emergency) return 'Emergency Service';
  const s = service.toLowerCase();
  if (s.includes('replace') || s.includes('install') || s.includes('new system') || s.includes('heat pump')) {
    return 'System Replacement Quote';
  }
  if (s.includes('maintenance') || s.includes('tune') || s.includes('cleaning')) return 'Maintenance';
  return 'Repair Consultation';
}

/**
 * POST /api/v1/widget/:token/book
 *
 * Complete, atomic booking workflow for the anonymous chat widget.
 * No JWT required — the organization is identified by the widget token.
 *
 * Requires a real, existing session (widgetSessionId) and enforces:
 *   - Stage gate (Layer 3): the session's current blueprint stage must list
 *     book_appointment in allowedTools — see default-blueprints.ts.
 *   - ToolGuards (Layer 7): guardBookAppointment — blocks duplicate bookings
 *     on an already-booked session.
 * Both checks run, and can reject, before any Lead/Appointment/Conversation
 * write happens.
 *
 * Performs in a single request:
 *   1. Resolve organization from token
 *   2. Look up the session; run the stage gate + ToolGuards check
 *   3. Update the session's conversation with the final messages
 *   4. Create lead and link conversation
 *   5. Create appointment and link lead + conversation
 *   6. Update lead with appointmentId; mark session memory as booked
 *   7. Fire booking automation
 *   8. Return full booking confirmation
 *
 * This is the only public endpoint that creates appointments.
 * The authenticated /api/v1/appointments endpoint is unchanged.
 */
export async function widgetBook(req: Request, res: Response, next: NextFunction) {
  try {
    const result = WidgetBookSchema.safeParse(req.body);
    if (!result.success) {
      const msg = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new ApiError(422, msg, 'VALIDATION_ERROR');
    }

    const d     = result.data;
    const orgId = await resolveOrg(req.params.token);

    // ── Session lookup (required) ─────────────────────────────────────────────
    // A booking must reference a real, existing session. widgetSessionId is
    // only ever used to look the session up — the conversationId used below
    // always comes from the resolved session document, never the client
    // (same server-authoritative principle as widgetChat()).
    const session = await AIConversationSessionModel
      .findOne({ widgetSessionId: d.widgetSessionId, organizationId: orgId })
      .lean();
    if (!session) {
      logger.warn(
        { organizationId: orgId, widgetSessionId: d.widgetSessionId },
        '[widgetBook] rejected: SESSION_NOT_FOUND',
      );
      throw new ApiError(404, 'Session not found', 'SESSION_NOT_FOUND');
    }

    // ── Stage gate (Layer 3) ───────────────────────────────────────────────────
    // Reuses the exact blueprint-loading + plan-building logic the live
    // orchestrator runs every turn (ConversationOrchestrationService) — no
    // separate "which stages allow booking" list is maintained here. Stages
    // that list book_appointment in allowedTools are defined once, in
    // conversation-engine/blueprints/default-blueprints.ts.
    const blueprint = await ConversationOrchestrationService.loadBlueprint(
      session.currentBlueprintId ?? null,
      '', // industry — fallback only, used when currentBlueprintId is absent;
      '', // intentCategory — same. A session with no blueprint yet safely
          // resolves to blueprint=null below, which correctly rejects booking
          // (the 'build_rapport' fallback objective has no allowed tools).
    );
    const stagePlan = ConversationOrchestrationService.buildConversationPlan({
      objective:     (session.currentObjective as ConversationObjective | null) ?? 'build_rapport',
      workflowState: (session.workflowState    as WorkflowState        | null) ?? 'initialising',
      blueprint,
      ruleApplied:   null,
      reason:        'widgetBook stage-gate check',
    });
    if (!stagePlan.allowedTools.includes('book_appointment')) {
      logger.warn(
        {
          conversationId: session.conversationId,
          organizationId: orgId,
          widgetSessionId: d.widgetSessionId,
          currentObjective: session.currentObjective ?? null,
          workflowState:    session.workflowState    ?? null,
          currentBlueprintId: session.currentBlueprintId ?? null,
        },
        '[widgetBook] rejected: BOOKING_STAGE_NOT_REACHED',
      );
      throw new ApiError(
        409,
        "This conversation hasn't reached a stage where booking is available yet.",
        'BOOKING_STAGE_NOT_REACHED',
      );
    }

    // ── Resolve authoritative contact info ─────────────────────────────────────
    // session.memory, not the request body, is the source of truth for phone —
    // the stage gate above already guarantees phoneCollected was reached
    // before any blueprint exposes book_appointment (see default-blueprints.ts),
    // so it is always populated here in a real conversation. visitorName is
    // guaranteed too for most blueprints, but the emergency-triage paths
    // (hvac.emergency, plumbing.emergency) gate booking on phone alone — so
    // d.customerName (only ever sent by the widget's collectName fallback UI,
    // shown when the AI never asked) is accepted as a fallback for name only.
    // If neither source has both, this is not a fake-data situation to paper
    // over with a placeholder — it's rejected outright.
    const memory       = (session.memory as ConversationMemory | undefined) ?? emptyMemory();
    const customerName = (memory.visitorName ?? d.customerName ?? '').trim();
    const phone         = (memory.phone         ?? '').trim();

    // phone.length < 7 mirrors CreateLeadSchema's own min(7) — belt-and-
    // suspenders so a malformed memory.phone value 422s cleanly here rather
    // than throwing an uncaught ZodError (→ 500) further down in step 2.
    if (!customerName || !phone || phone.length < 7) {
      // Never log the raw name/phone value here (PII on an unauthenticated
      // endpoint's logs) — only what was missing and enough identifiers to
      // pull up the real session/conversation record afterward.
      logger.warn(
        {
          conversationId: session.conversationId,
          organizationId: orgId,
          widgetSessionId: d.widgetSessionId,
          currentObjective: session.currentObjective ?? null,
          workflowState:    session.workflowState    ?? null,
          hasName:          Boolean(customerName),
          hasPhone:         Boolean(phone),
          phoneLength:      phone.length,
        },
        '[widgetBook] rejected: MISSING_CONTACT_INFO',
      );
      throw new ApiError(
        422,
        "This conversation hasn't collected the visitor's name and phone number yet — booking can't be completed without them.",
        'MISSING_CONTACT_INFO',
      );
    }

    // ── ToolGuards (Layer 7) ───────────────────────────────────────────────────
    // guardBookAppointment (the only guard relevant to 'book_appointment')
    // reads call.params (guestName/guestEmail/guestPhone) and
    // ctx.memory.bookingStatus (blocks a duplicate booking on an
    // already-booked session) — verified by reading ToolGuards.ts directly.
    // The remaining ToolSelectionContext fields (intent, userMessage) are
    // structurally required by the type but not read by this guard; they're
    // real session/org data wherever available, and honestly-labelled
    // placeholders only where no such data exists for a booking-form
    // submission (there is no "current message" being processed here).
    const richMemory = memoryToRich(session.memory as any);
    const identity    = await BusinessIdentityService.load(orgId);
    const toolCall: ToolCall = {
      tool:       'book_appointment',
      params:     { guestName: customerName, guestEmail: d.email, guestPhone: phone },
      reason:     'Booking request from widget',
      priority:   'critical',
      required:   true,
      idempotent: false,
    };
    const guardCtx: ToolSelectionContext = {
      organizationId: orgId,
      conversationId: session.conversationId,
      memory:         richMemory,
      stage:          (session.stage as ConversationStage) ?? 'greeting',
      workflowState:  (session.workflowState    as WorkflowState)        ?? 'initialising',
      objective:      (session.currentObjective as ConversationObjective) ?? 'build_rapport',
      qualification:  session.qualification ?? qualifyLead(richMemory),
      turnCount:      session.turnCount,
      // Not read by guardBookAppointment — see comment above. If a future
      // guard starts reading these, populate them honestly instead of
      // extending the placeholder.
      intent:      NO_CURRENT_MESSAGE_INTENT,
      userMessage: '',
      identity:    identity ?? ({} as BusinessIdentity),
    };
    const guardResult = ToolGuards.check(toolCall, guardCtx);
    if (!guardResult.allowed) {
      logger.warn(
        {
          conversationId: session.conversationId,
          organizationId: orgId,
          widgetSessionId: d.widgetSessionId,
          reason: guardResult.reason ?? null,
        },
        '[widgetBook] rejected: BOOKING_BLOCKED',
      );
      throw new ApiError(409, guardResult.reason ?? 'Booking blocked', 'BOOKING_BLOCKED');
    }

    // ── 1. Reuse the session's conversation ───────────────────────────────────
    // The session (and therefore its conversation) is now guaranteed to exist —
    // there is no "create a new conversation" branch anymore.
    const convId = session.conversationId;
    if (d.messages.length > 0) {
      await ConversationService.update(orgId, convId, {
        status:        'completed',
        lastMessageAt: new Date().toISOString(),
        messages:      d.messages as any,
      }).catch(() => { /* best-effort */ });
    }

    // ── 2. Create lead ───────────────────────────────────────────────────────
    const leadDto = CreateLeadSchema.parse({
      name:                customerName,
      phone:               phone,
      email:               d.email ?? '',
      address:             d.address,
      zipCode:             d.zipCode,
      hvacNeed:            d.hvacNeed ?? d.service,
      emergency:           d.emergency,
      source:              'widget',
      status:              d.status,
      priority:            d.priority,
      value:               d.value,
      conversationId:      convId,
      qualificationReason: d.qualificationReason,
      preferredDay:        d.preferredDay,
      notes:               d.notes ?? `Booked via widget chat. Service: ${d.service}.`,
    });
    const lead = await LeadService.create(orgId, leadDto);

    // ── 3. Generate confirmation number ─────────────────────────────────────
    const confirmationNumber = `LF-${randomBytes(3).toString('hex').toUpperCase()}`;

    // ── 4. Create appointment ────────────────────────────────────────────────
    const appointment = await AppointmentService.create(orgId, {
      leadId:             lead.id,
      leadName:           customerName,
      leadPhone:          phone,
      customerEmail:      d.email,
      address:            d.address,
      zipCode:            d.zipCode,
      conversationId:     convId,
      date:               d.date,
      time:               d.time,
      duration:           d.duration,
      type:               inferType(d.service, d.emergency),
      status:             'Confirmed',
      notes:              d.notes ?? `Booked via widget chat. Service: ${d.service}.`,
      confirmationNumber,
      source:             'widget',
      value:              d.value,
    });

    // ── 5. Back-link appointment on lead ─────────────────────────────────────
    await LeadService.update(orgId, lead.id, { appointmentId: appointment.id }).catch(() => {});

    // ── 5b. Mark the session's memory as booked ───────────────────────────────
    // Required for guardBookAppointment's duplicate-prevention check (above)
    // to ever actually fire on a later attempt against this same session —
    // memory.bookingStatus was previously never set to 'booked' anywhere in
    // the live path. This is the ConversationMemory.bookingStatus field
    // (already read throughout ai/ and response-engine/), NOT the separate,
    // under-wired AIConversationSession.status ('active'|'archived'|'booked')
    // lifecycle enum — that field is untouched by this change.
    await AIConversationSessionModel.findByIdAndUpdate(session._id, {
      $set: { 'memory.bookingStatus': 'booked' },
    });

    // Trigger point (c) for the async conversation-summary pipeline — a
    // successful booking is a real "conversation ended" signal, functionally
    // independent of the legacy stage machine reaching 'completed' (this
    // endpoint bypasses runOrchestrator()/computeNextStage() entirely).
    // jobId dedup (keyed by conversationId) collapses this with trigger (a)
    // if a later chat turn also transitions stage to 'completed'.
    enqueueConversationSummary(convId, orgId).catch(err => {
      logger.warn({ err, conversationId: convId, organizationId: orgId }, '[widgetBook] Failed to enqueue conversation summary job');
    });

    // ── 6. Fire booking automation (fire-and-forget) ──────────────────────────
    AutomationService.fire('booking_made', orgId, lead.id, {
      bookingId:    appointment.id,
      meetingType:  inferType(d.service, d.emergency),
      confirmationNumber,
    });

    // ── 7. Return confirmation ────────────────────────────────────────────────
    res.status(201).json({
      status: 'ok',
      data: {
        appointmentId:     appointment.id,
        confirmationNumber,
        conversationId:    convId,
        leadId:            lead.id,
        customerName:      customerName,
        service:           d.service,
        date:              d.date,
        time:              d.time,
        displayDate:       d.displayDate,
        displayTime:       d.displayTime,
        estimatedDuration: d.duration,
        address:           d.address,
      },
    });
  } catch (e) { next(e); }
}
