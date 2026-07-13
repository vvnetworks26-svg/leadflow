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
import { randomBytes }         from 'crypto';
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

    const output = await runOrchestrator({
      organizationId: orgId,
      conversationId,
      userMessage:    message.trim(),
      history:        session.history,
      memory:         session.memory as any ?? emptyMemory(),
      stage:          (session.stage as ConversationStage) ?? 'greeting',
      currentPage,
    });

    const newHistory = [
      ...session.history,
      { role: 'user' as const,      content: message },
      { role: 'assistant' as const, content: output.reply },
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
