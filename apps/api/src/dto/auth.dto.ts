import { z } from 'zod';
import { PhoneSchema } from '../business-identity/schemas';

// ─── Register ─────────────────────────────────────────────────────────────────
// `role` is intentionally absent. The service always assigns 'owner'.
// `organizationName` is optional — defaults to "<FirstName> <LastName>'s Organization".
// `phone` is required — the seeded Business document is created with it
// immediately, so BusinessIdentityFactory validation (and therefore Layer 3
// orchestration) is live from the first turn instead of silently disabled
// until someone fills it in later via Business Settings. Reuses PhoneSchema
// (business-identity/schemas.ts) verbatim — the single source of truth for
// this bound; do not redefine it here.
export const RegisterSchema = z.object({
  firstName:        z.string().min(1, 'First name is required').max(50).trim(),
  lastName:         z.string().min(1, 'Last name is required').max(50).trim(),
  email:            z.string().email('Invalid email address').toLowerCase().trim(),
  password:         z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password too long'),
  phone:            PhoneSchema,
  organizationName: z.string().min(1).max(100).trim().optional(),
});

export type RegisterDto = z.infer<typeof RegisterSchema>;

// ─── Login ────────────────────────────────────────────────────────────────────
export const LoginSchema = z.object({
  email:    z.string().email('Invalid email address').toLowerCase().trim(),
  password: z.string().min(1, 'Password is required'),
});

export type LoginDto = z.infer<typeof LoginSchema>;

// ─── Logout ───────────────────────────────────────────────────────────────────
export const LogoutSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken is required'),
});

export type LogoutDto = z.infer<typeof LogoutSchema>;
