import { z } from 'zod';

// ─── Register ─────────────────────────────────────────────────────────────────
// `role` is intentionally absent. The service always assigns 'owner'.
// `organizationName` is optional — defaults to "<FirstName> <LastName>'s Organization".
export const RegisterSchema = z.object({
  firstName:        z.string().min(1, 'First name is required').max(50).trim(),
  lastName:         z.string().min(1, 'Last name is required').max(50).trim(),
  email:            z.string().email('Invalid email address').toLowerCase().trim(),
  password:         z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password too long'),
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
