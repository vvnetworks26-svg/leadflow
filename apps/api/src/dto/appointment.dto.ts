import { z } from 'zod';

export const CreateAppointmentSchema = z.object({
  leadId:             z.string().min(1),
  leadName:           z.string().min(1).trim(),
  leadPhone:          z.string().min(7).trim(),
  conversationId:     z.string().optional(),
  customerEmail:      z.string().email().toLowerCase().optional(),
  address:            z.string().optional(),
  zipCode:            z.string().optional(),
  confirmationNumber: z.string().optional(),
  source:             z.string().optional(),
  date:               z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  time:               z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM'),
  duration:           z.number().int().min(15),
  type:               z.enum(['Maintenance','Repair Consultation','System Replacement Quote','Emergency Service']),
  status:             z.enum(['Scheduled','Completed','Canceled','No Show','Pending','Confirmed','Rescheduled']).optional().default('Scheduled'),
  notes:              z.string().optional().default(''),
  assignedTechnician: z.string().optional(),
  value:              z.number().min(0).optional(),
});
export type CreateAppointmentDto = z.infer<typeof CreateAppointmentSchema>;

export const UpdateAppointmentSchema = CreateAppointmentSchema.partial();
export type UpdateAppointmentDto = z.infer<typeof UpdateAppointmentSchema>;

export const AppointmentQuerySchema = z.object({
  status:  z.enum(['Scheduled','Completed','Canceled','No Show','Pending','Confirmed','Rescheduled']).optional(),
  type:    z.enum(['Maintenance','Repair Consultation','System Replacement Quote','Emergency Service']).optional(),
  leadId:  z.string().optional(),
  date:    z.string().optional(),
  search:  z.string().optional(),
  page:    z.coerce.number().int().min(1).optional(),
  limit:   z.coerce.number().int().min(1).max(100).optional(),
  sortBy:  z.string().optional(),
  order:   z.enum(['asc','desc']).optional(),
});
export type AppointmentQueryDto = z.infer<typeof AppointmentQuerySchema>;
