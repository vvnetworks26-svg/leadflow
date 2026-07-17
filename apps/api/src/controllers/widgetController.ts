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
import { LeadService }         from '../services/LeadService';
import { ConversationService } from '../services/ConversationService';
import { AppointmentService }  from '../services/AppointmentService';
import { ApiError }            from '../middleware/errorHandler';
import { CreateLeadSchema }    from '../dto/lead.dto';
import { CreateConversationSchema } from '../dto/conversation.dto';
import { runOrchestrator }     from '../ai/orchestrator';
import { AIConversationSessionModel } from '../models/AIConversationSession.model';
import { emptyMemory }         from '../ai/types';
import { makeEvent, persistEvents } from '../ai/analytics';
import { AutomationService }   from '../crm/automation/AutomationService';
import { z }                   from 'zod';
import type { ConversationStage } from '../ai/types';
import type { AppointmentType }   from '../types';

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
 */
export async function widgetChat(req: Request, res: Response, next: NextFunction) {
  try {
    const { message, conversationId, currentPage } = req.body as {
      message:        string;
      conversationId: string;
      currentPage?:   string;
    };
    if (!message || !message.trim()) throw new ApiError(422, 'message is required', 'VALIDATION_ERROR');
    if (!conversationId)             throw new ApiError(422, 'conversationId is required', 'VALIDATION_ERROR');

    const orgId = await resolveOrg(req.params.token);

    // Load or create session
    let session = await AIConversationSessionModel.findOne({ conversationId, organizationId: orgId });
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

    /**
     * __init__ is a synthetic sentinel sent by the widget on first open to
     * request the AI's opening greeting without the user having typed anything.
     * We treat it as a standard greeting turn so the orchestrator generates a
     * welcome message; we just don't echo it back into the history as a user
     * message.
     */
    const isInit       = message.trim() === '__init__';
    const userMessage  = isInit ? 'Hello' : message.trim();

    const output = await runOrchestrator({
      organizationId: orgId,
      conversationId,
      userMessage,
      history:        session.history,
      memory:         session.memory as any ?? emptyMemory(),
      stage:          (session.stage as ConversationStage) ?? 'greeting',
      currentPage,
    });

    const newHistory = [
      ...session.history,
      // For __init__ (greeting), only store the assistant reply — no user turn.
      // For real messages, store both sides.
      ...(isInit
        ? [{ role: 'assistant' as const, content: output.reply }]
        : [
            { role: 'user' as const,      content: message },
            { role: 'assistant' as const, content: output.reply },
          ]
      ),
    ].slice(-MAX_WIDGET_HISTORY);

    await AIConversationSessionModel.findByIdAndUpdate(session._id, {
      stage:        output.updatedStage,
      memory:       output.updatedMemory,
      history:      newHistory,
      qualification:output.qualification,
      turnCount:    session.turnCount + 1,
      lastActivity: new Date(),
    });

    res.json({
      status: 'ok',
      data: {
        reply:           output.reply,
        stage:           output.updatedStage,
        bookingTriggered:output.bookingTriggered,
      },
    });
  } catch (e) { next(e); }
}

// ─── Booking input schema ─────────────────────────────────────────────────────

const WidgetBookSchema = z.object({
  // Visitor identity
  customerName:  z.string().min(1).trim(),
  phone:         z.string().min(7).trim(),
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

  // Pre-existing conversation id (widget may have already created it)
  conversationId: z.string().optional(),

  // Chat messages to store on the conversation
  messages: z.array(z.object({
    id:        z.string(),
    sender:    z.enum(['ai', 'user', 'agent']),
    text:      z.string(),
    timestamp: z.string(),
  })).optional().default([]),
});

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
 * Performs in a single request:
 *   1. Resolve organization from token
 *   2. Create (or reuse) conversation record
 *   3. Create lead and link conversation
 *   4. Create appointment and link lead + conversation
 *   5. Update lead with appointmentId
 *   6. Fire booking automation
 *   7. Return full booking confirmation
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

    // ── 1. Create or reuse conversation ─────────────────────────────────────
    let convId = d.conversationId ?? '';

    if (!convId) {
      const conv = await ConversationService.create(orgId, {
        leadName:      d.customerName,
        leadPhone:     d.phone,
        leadEmail:     d.email,
        hvacNeed:      d.service,
        status:        'completed',
        lastMessageAt: new Date().toISOString(),
        messages:      d.messages,
      });
      convId = conv.id as string;
    } else {
      // Conversation was pre-created by the widget; update its messages if provided
      if (d.messages.length > 0) {
        await ConversationService.update(orgId, convId, {
          status:        'completed',
          lastMessageAt: new Date().toISOString(),
          messages:      d.messages as any,
        }).catch(() => { /* best-effort */ });
      }
    }

    // ── 2. Create lead ───────────────────────────────────────────────────────
    const leadDto = CreateLeadSchema.parse({
      name:                d.customerName,
      phone:               d.phone,
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
      leadName:           d.customerName,
      leadPhone:          d.phone,
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
        customerName:      d.customerName,
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
