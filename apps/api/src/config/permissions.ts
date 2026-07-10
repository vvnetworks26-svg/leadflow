/**
 * permissions.ts
 *
 * Centralised role constants and permission matrix for the authorize() middleware.
 *
 * Role hierarchy (highest → lowest):
 *   owner   — full access including billing, ownership transfer, org deletion
 *   admin   — everything except billing and ownership
 *   manager — CRM, appointments, projects
 *   agent   — CRM and appointments (no settings, no delete)
 *   viewer  — read-only on everything
 *
 * Every route imports from here — no role arrays are hardcoded in route files.
 */

import type { MemberRole } from '../models/Organization.model';

// ─── Role sets ────────────────────────────────────────────────────────────────

/** All roles — viewer-level read access. */
export const ALL_ROLES: MemberRole[] = ['owner', 'admin', 'manager', 'agent', 'viewer'];

/** Owner + admin — admin-level writes. */
export const OWNER_ADMIN: MemberRole[] = ['owner', 'admin'];

/** Owner + admin + manager — manager-level writes (CRM, appointments, projects). */
export const MANAGER_AND_ABOVE: MemberRole[] = ['owner', 'admin', 'manager'];

/** Owner + admin + manager + agent — field-level writes (leads, appointments). */
export const AGENT_AND_ABOVE: MemberRole[] = ['owner', 'admin', 'manager', 'agent'];

/** Owner only — destructive or privileged operations (delete, billing, org config). */
export const OWNER_ONLY: MemberRole[] = ['owner'];

// ─── Role hierarchy ───────────────────────────────────────────────────────────

/** Numeric weight for ordering roles; higher = more privileges. */
export const ROLE_WEIGHT: Record<MemberRole, number> = {
  owner:   100,
  admin:    80,
  manager:  60,
  agent:    40,
  viewer:   20,
};

/**
 * Returns true if `userRole` has at least the same privilege level as
 * `requiredRole`. Use for programmatic checks inside service code.
 *
 * Example:
 *   hasPermission('manager', 'agent')  → true
 *   hasPermission('agent',   'admin')  → false
 */
export function hasPermission(userRole: MemberRole, requiredRole: MemberRole): boolean {
  return ROLE_WEIGHT[userRole] >= ROLE_WEIGHT[requiredRole];
}

// ─── Permission matrix ────────────────────────────────────────────────────────
// Declarative map of capabilities per role for documentation and guards.

export const PERMISSION_MATRIX = {
  leads: {
    read:   AGENT_AND_ABOVE,
    write:  AGENT_AND_ABOVE,
    delete: OWNER_ADMIN,
  },
  appointments: {
    read:   AGENT_AND_ABOVE,
    write:  AGENT_AND_ABOVE,
    delete: OWNER_ADMIN,
  },
  conversations: {
    read:   AGENT_AND_ABOVE,
    write:  AGENT_AND_ABOVE,
    delete: OWNER_ADMIN,
  },
  notifications: {
    read:   ALL_ROLES,
    write:  OWNER_ADMIN,
    delete: OWNER_ONLY,
  },
  organization: {
    read:   ALL_ROLES,
    write:  OWNER_ADMIN,
    delete: OWNER_ONLY,
  },
  members: {
    read:   MANAGER_AND_ABOVE,
    invite: OWNER_ADMIN,
    remove: OWNER_ADMIN,
  },
  billing: {
    read:   OWNER_ONLY,
    write:  OWNER_ONLY,
  },
} as const;
