/**
 * permissions.ts
 *
 * Centralised role constants for the authorize() middleware.
 * Every route imports from here instead of hardcoding role arrays inline.
 *
 * When organisation-level permissions are introduced in a future epic,
 * this is the single file that needs to change — no route files need rewriting.
 */

/** All three roles — read-only access for everyone. */
export const ALL_ROLES = ['owner', 'admin', 'technician'] as const;

/** Owner and admin only — create / update operations. */
export const OWNER_ADMIN = ['owner', 'admin'] as const;

/** Owner only — destructive or privileged operations. */
export const OWNER_ONLY = ['owner'] as const;
