import { z } from 'zod';

const LeadStatusEnum   = z.enum(['New','Contacted','Qualified','Unqualified','Proposal','Closed Won','Closed Lost']);
const PriorityEnum     = z.enum(['Low','Medium','High']);
const TemperatureEnum  = z.enum(['Hot','Warm','Cold','Disqualified']);
const LifecycleEnum    = z.enum(['subscriber','lead','marketing_qualified','sales_qualified','opportunity','customer','evangelist','other']);

export const CreateLeadSchema = z.object({
  name:                z.string().min(1).trim(),
  email:               z.union([z.string().email().toLowerCase().trim(), z.literal('')]).optional().default(''),
  phone:               z.string().min(7).trim(),
  address:             z.string().trim().optional().default(''),
  zipCode:             z.string().trim().optional(),
  company:             z.string().trim().optional(),
  jobTitle:            z.string().trim().optional(),

  pipelineId:          z.string().optional().nullable(),
  stageId:             z.string().optional().nullable(),
  stageName:           z.string().optional().nullable(),

  status:              LeadStatusEnum.optional().default('New'),
  priority:            PriorityEnum.optional().default('Medium'),
  temperature:         TemperatureEnum.optional().default('Cold'),
  lifecycleStage:      LifecycleEnum.optional().default('lead'),
  score:               z.number().min(0).max(100).optional().default(0),

  value:               z.number().min(0).optional().default(0),
  estimatedValue:      z.number().min(0).optional().default(0),
  expectedCloseDate:   z.string().optional().nullable(),
  lostReason:          z.string().optional().nullable(),

  source:              z.string().trim().optional().default(''),
  ownerId:             z.string().optional().nullable(),
  tags:                z.array(z.string()).optional().default([]),

  nextFollowUpAt:      z.string().optional().nullable(),
  hvacNeed:            z.string().trim().optional().default('General inquiry'),
  emergency:           z.boolean().optional().default(false),
  conversationId:      z.string().optional(),
  qualificationReason: z.string().optional(),
  preferredDay:        z.string().optional(),
  appointmentId:       z.string().optional(),
  notes:               z.string().optional().default(''),
  customFields:        z.record(z.unknown()).optional().default({}),
});
export type CreateLeadDto = z.infer<typeof CreateLeadSchema>;

export const UpdateLeadSchema = CreateLeadSchema.partial();
export type UpdateLeadDto = z.infer<typeof UpdateLeadSchema>;

export const LeadQuerySchema = z.object({
  status:        LeadStatusEnum.optional(),
  priority:      PriorityEnum.optional(),
  temperature:   TemperatureEnum.optional(),
  lifecycleStage:LifecycleEnum.optional(),
  pipelineId:    z.string().optional(),
  stageId:       z.string().optional(),
  ownerId:       z.string().optional(),
  source:        z.string().optional(),
  tags:          z.string().optional(),   // comma-separated
  search:        z.string().optional(),
  minScore:      z.coerce.number().optional(),
  maxScore:      z.coerce.number().optional(),
  page:          z.coerce.number().int().min(1).optional(),
  limit:         z.coerce.number().int().min(1).max(100).optional(),
  sortBy:        z.string().optional(),
  order:         z.enum(['asc','desc']).optional(),
});
export type LeadQueryDto = z.infer<typeof LeadQuerySchema>;

export const MoveStageSchema = z.object({
  pipelineId: z.string().min(1),
  stageId:    z.string().min(1),
  stageName:  z.string().min(1),
  reason:     z.string().optional(),
});
export type MoveStageDto = z.infer<typeof MoveStageSchema>;
