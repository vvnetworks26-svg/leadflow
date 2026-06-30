import { z } from 'zod';

const MessageSchema = z.object({
  id:        z.string(),
  sender:    z.enum(['ai','user','agent']),
  text:      z.string().min(1),
  timestamp: z.string(),
});

export const CreateConversationSchema = z.object({
  leadName:      z.string().min(1).trim(),
  leadPhone:     z.string().min(7).trim(),
  leadEmail:     z.string().email().optional(),
  messages:      z.array(MessageSchema).optional().default([]),
  status:        z.enum(['active','archived','snoozed','completed']).optional().default('active'),
  lastMessageAt: z.string().optional().default(() => new Date().toISOString()),
  hvacNeed:      z.string().optional(),
  leadId:        z.string().optional(),
  appointmentId: z.string().optional(),
});
export type CreateConversationDto = z.infer<typeof CreateConversationSchema>;

export const UpdateConversationSchema = CreateConversationSchema.partial();
export type UpdateConversationDto = z.infer<typeof UpdateConversationSchema>;

export const AddMessageSchema = z.object({
  sender: z.enum(['ai','user','agent']),
  text:   z.string().min(1),
});
export type AddMessageDto = z.infer<typeof AddMessageSchema>;

export const ConversationQuerySchema = z.object({
  status:  z.enum(['active','archived','snoozed','completed']).optional(),
  leadId:  z.string().optional(),
  search:  z.string().optional(),
  page:    z.coerce.number().int().min(1).optional(),
  limit:   z.coerce.number().int().min(1).max(100).optional(),
  sortBy:  z.string().optional(),
  order:   z.enum(['asc','desc']).optional(),
});
export type ConversationQueryDto = z.infer<typeof ConversationQuerySchema>;
