import { z } from 'zod';

// ─── Register ─────────────────────────────────────────────────────────────────
export const RegisterSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(50).trim(),
  lastName:  z.string().min(1, 'Last name is required').max(50).trim(),
  email:     z.string().email('Invalid email address').toLowerCase().trim(),
  password:  z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password too long'),
  role: z.enum(['owner', 'admin', 'technician']).optional().default('owner'),
});

export type RegisterDto = z.infer<typeof RegisterSchema>;

// ─── Login ────────────────────────────────────────────────────────────────────
export const LoginSchema = z.object({
  email:    z.string().email('Invalid email address').toLowerCase().trim(),
  password: z.string().min(1, 'Password is required'),
});

export type LoginDto = z.infer<typeof LoginSchema>;
