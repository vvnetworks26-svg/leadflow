import { z } from 'zod';

export const CreateLeadSchema = z.object({
  name:                z.string().min(1).trim(),
  email:               z.union([z.string().email().toLowerCase().trim(), z.literal('')]).optional().default(''),
  phone:               z.string().min(7).trim(),
  address:             z.string().trim().optional().default(''),
  zipCode:             z.string().trim().optional(),
  status:              z.enum(['New','Contacted','Qualified','Unqualified','Proposal','Closed Won','Closed Lost']).optional().default('New'),
  priority:            z.enum(['Low','Medium','High']).optional().default('Medium'),
  value:               z.number().min(0).optional().default(0),
  source:              z.string().trim().optional().default(''),
  hvacNeed:            z.string().min(1).trim(),
  emergency:           z.boolean().optional().default(false),
  conversationId:      z.string().optional(),
  qualificationReason: z.string().optional(),
  preferredDay:        z.string().optional(),
  appointmentId:       z.string().optional(),
  notes:               z.string().optional().default(''),
});
export type CreateLeadDto = z.infer<typeof CreateLeadSchema>;

export const UpdateLeadSchema = CreateLeadSchema.partial();
export type UpdateLeadDto = z.infer<typeof UpdateLeadSchema>;

export const LeadQuerySchema = z.object({
  status:   z.enum(['New','Contacted','Qualified','Unqualified','Proposal','Closed Won','Closed Lost']).optional(),
  priority: z.enum(['Low','Medium','High']).optional(),
  source:   z.string().optional(),
  search:   z.string().optional(),
  page:     z.coerce.number().int().min(1).optional(),
  limit:    z.coerce.number().int().min(1).max(100).optional(),
  sortBy:   z.string().optional(),
  order:    z.enum(['asc','desc']).optional(),
});
export type LeadQueryDto = z.infer<typeof LeadQuerySchema>;
