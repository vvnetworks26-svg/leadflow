/**
 * VariableResolver.ts
 *
 * Resolves workflow variables from trigger data and loads related records.
 * Replaces {{variable}} template strings in action params.
 * All lookups are organization-scoped.
 */

import type { WorkflowVariable, ExecutionContext } from '../types';
import { LeadModel }         from '../../models/Lead.model';
import { BookingModel }      from '../../models/Booking.model';
import { OrganizationModel } from '../../models/Organization.model';

// ─── Template string interpolation ───────────────────────────────────────────

/**
 * Replace {{key}} placeholders in a string with values from the context.
 * Supports dot-notation: {{lead.name}}, {{lead.email}}, etc.
 */
export function interpolate(template: string, ctx: Record<string, unknown>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, path) => {
    const val = resolvePath(ctx, path.trim());
    return val !== undefined && val !== null ? String(val) : '';
  });
}

function resolvePath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((cur: unknown, key) => {
    if (cur === null || cur === undefined) return undefined;
    return (cur as Record<string, unknown>)[key];
  }, obj);
}

/**
 * Deep-interpolate all string values in a params object.
 */
export function interpolateParams(
  params: Record<string, unknown>,
  ctx:    Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string') {
      result[k] = interpolate(v, ctx);
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      result[k] = interpolateParams(v as Record<string, unknown>, ctx);
    } else {
      result[k] = v;
    }
  }
  return result;
}

// ─── Context builder ──────────────────────────────────────────────────────────

/**
 * Build the full execution context variables from trigger data.
 * Loads related records lazily (only what's needed per workflow).
 */
export async function buildContext(
  executionCtx: ExecutionContext,
  variables:    WorkflowVariable[],
): Promise<Record<string, unknown>> {
  const ctx: Record<string, unknown> = {
    // Built-in system variables
    current_date:      new Date().toISOString().slice(0, 10),
    current_time:      new Date().toISOString(),
    organization_id:   executionCtx.organizationId,
    execution_id:      executionCtx.executionId,
    trigger_type:      executionCtx.triggerType,
    // Spread trigger data at root level for easy access
    ...executionCtx.triggerData,
    // Nested namespaced access
    trigger:           executionCtx.triggerData,
  };

  // Load lead if leadId is present in trigger data
  const leadId = (executionCtx.triggerData.leadId ?? executionCtx.triggerData.id) as string | undefined;
  if (leadId) {
    try {
      const lead = await LeadModel.findOne({ _id: leadId, organizationId: executionCtx.organizationId }).lean();
      if (lead) ctx.lead = lead;
    } catch { /* non-blocking */ }
  }

  // Load booking if bookingId is present
  const bookingId = executionCtx.triggerData.bookingId as string | undefined;
  if (bookingId) {
    try {
      const booking = await BookingModel.findOne({ _id: bookingId, organizationId: executionCtx.organizationId }).lean();
      if (booking) ctx.booking = booking;
    } catch { /* non-blocking */ }
  }

  // Load org
  try {
    const org = await OrganizationModel.findById(executionCtx.organizationId).lean();
    if (org) ctx.organization = org;
  } catch { /* non-blocking */ }

  // Apply custom variable defaults
  for (const v of variables) {
    if (ctx[v.key] === undefined) {
      ctx[v.key] = v.defaultValue;
    }
  }

  // Merge any previously resolved variables
  Object.assign(ctx, executionCtx.variables);

  return ctx;
}
