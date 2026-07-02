import { z } from 'zod';

// ─── Register ─────────────────────────────────────────────────────────────────
// `role` is intentionally absent. The service always assigns 'owner'.
// Any client-supplied role field is silently ignored by Zod's strip behaviour.
export const RegisterSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(50).trim(),
  lastName:  z.string().min(1, 'Last name is required').max(50).trim(),
  email:     z.string().email('Invalid email address').toLowerCase().trim(),
  password:  z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password too long'),
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
