# Implementation Plan: CRM Production Readiness

## Overview

Tasks are grouped by the area they touch and ordered by dependency. Each task is self-contained unless marked as depending on another. The final task (build verification) depends on all others.

---

## Tasks

- [ ] 1. Add date-range and follow-up filters to `LeadQuerySchema`
  - Open `apps/api/src/dto/lead.dto.ts`
  - Add `createdAfter: z.string().datetime({ offset: true }).optional()` to `LeadQuerySchema`
  - Add `createdBefore: z.string().datetime({ offset: true }).optional()` to `LeadQuerySchema`
  - Add `followUpBefore: z.string().datetime({ offset: true }).optional()` to `LeadQuerySchema`
  - **Requirement:** 1.7
  - **File:** `apps/api/src/dto/lead.dto.ts`

- [ ] 2. Apply new filters, sort allowlist, and limit cap in `LeadService.list`
  - Open `apps/api/src/services/LeadService.ts`
  - Add a `LEAD_SORTABLE_FIELDS` Set constant; if `q.sortBy` is not in the set, fall back to `'createdAt'`
  - Apply `filter.createdAt` range when `q.createdAfter` or `q.createdBefore` is set
  - Apply `filter.nextFollowUpAt = { $ne: null, $lte: new Date(q.followUpBefore) }` when `q.followUpBefore` is set
  - Cap `limit` at 100: `const limit = Math.min(q.limit ?? 20, 100)`
  - Confirm default sort is `createdAt` descending when no `sortBy` is provided
  - **Requirement:** 1.1, 1.2, 1.3, 1.5, 1.6
  - **File:** `apps/api/src/services/LeadService.ts`

- [ ] 3. Embed linked appointment and conversation in `GET /leads/:id`
  - Open `apps/api/src/controllers/leadController.ts`
  - After calling `LeadService.getById`, run `Promise.allSettled` to fetch `AppointmentService.getById` (if `lead.appointmentId` is set) and `ConversationService.getById` (if `lead.conversationId` is set)
  - Both fetches must use `.catch(() => null)` — a missing linked document must never cause a 500
  - Add the fetched documents as `appointment` and `conversation` fields on the response `data` object; set to `null` if missing or if the ID was not set
  - **Requirement:** 2.1, 2.2
  - **File:** `apps/api/src/controllers/leadController.ts`

- [ ] 4. Add `GET /leads/:id/appointments` and `GET /leads/:id/conversations` routes
  - Add `getLeadAppointments` handler to `apps/api/src/controllers/leadController.ts`: calls `AppointmentService.list(orgId, { leadId: req.params.id, ...pagination })`, returns `PaginatedResult`
  - Add `getLeadConversations` handler to `apps/api/src/controllers/leadController.ts`: calls `ConversationService.list(orgId, { leadId: req.params.id, ...pagination })`, returns `PaginatedResult`
  - Register `router.get('/:id/appointments', authorize(...ALL_ROLES), getLeadAppointments)` in `lead.routes.ts`
  - Register `router.get('/:id/conversations', authorize(...ALL_ROLES), getLeadConversations)` in `lead.routes.ts`
  - **Requirement:** 2.3, 2.4
  - **Files:** `apps/api/src/controllers/leadController.ts`, `apps/api/src/routes/lead.routes.ts`

- [ ] 5. Add cascade delete to `LeadService.delete`
  - In `apps/api/src/services/LeadService.ts`, after `LeadModel.findOneAndDelete`, run `Promise.allSettled` to delete all `Note` documents where `leadId = id`, delete all `Activity` documents where `leadId = id`, and unset `leadId` on all `Conversation` documents where `leadId = id`
  - Import `NoteModel`, `ActivityModel`, `ConversationModel`
  - Log any `allSettled` rejections at `warn` level; do NOT block the 204 response
  - **Requirement:** 2.5
  - **File:** `apps/api/src/services/LeadService.ts`

- [ ] 6. Validate `appointmentId` reference on `PATCH /leads/:id`
  - In `apps/api/src/controllers/leadController.ts` (or `LeadService.update`), when the update DTO contains `appointmentId`, call `AppointmentService.getById(orgId, dto.appointmentId)` wrapped in a try/catch; if it throws (not found or wrong org), throw `ApiError(422, ..., 'INVALID_APPOINTMENT_REFERENCE')`
  - **Requirement:** 2.6
  - **File:** `apps/api/src/controllers/leadController.ts`

- [ ] 7. Add date-range, `appointmentId`, and extended search filters to `ConversationQuerySchema`
  - Open `apps/api/src/dto/conversation.dto.ts`
  - Add `createdAfter`, `createdBefore` (ISO datetime), and `appointmentId` (string) as optional fields
  - **Requirement:** 3.7
  - **File:** `apps/api/src/dto/conversation.dto.ts`

- [ ] 8. Apply new filters and extend search in `ConversationService.list`
  - Apply `filter.createdAt` range when `q.createdAfter` or `q.createdBefore` is set
  - Apply `filter.appointmentId = q.appointmentId` when set
  - Extend the search `$or` to include `{ hvacNeed: re }` alongside `leadName` and `leadPhone`
  - **Requirement:** 3.3, 3.4, 3.5
  - **File:** `apps/api/src/services/ConversationService.ts`

- [ ] 9. Add `ConversationService.delete` and `DELETE /conversations/:id` route
  - Add `async delete(organizationId: string, id: string): Promise<void>` to `ConversationService`: call `findOneAndDelete`, then unset `Lead.conversationId` if `doc.leadId` is set, then fire-and-forget `ActivityService.log` with title `'Conversation deleted'`
  - Add `remove` handler to `apps/api/src/controllers/conversationController.ts`
  - Register `router.delete('/:id', authorize(...AGENT_AND_ABOVE), remove)` in `conversation.routes.ts`
  - **Requirement:** 3.1, 3.2
  - **Files:** `apps/api/src/services/ConversationService.ts`, `apps/api/src/controllers/conversationController.ts`, `apps/api/src/routes/conversation.routes.ts`

- [ ] 10. Enforce note authorship in `NoteService.update` and `NoteService.delete`
  - Update `NoteService.update` signature to accept `requestingUserId: string` and `requestingRole: string`
  - Fetch the note first with `findOne`; if `note.authorId !== requestingUserId && !['admin','owner'].includes(requestingRole)`, throw `ApiError(403, ..., 'NOTE_AUTHOR_REQUIRED')`
  - Apply the same pattern to `NoteService.delete`
  - Update `crmController.ts` to pass `req.user.id` and `req.user.role` to both methods
  - Ensure `authorId` on `POST /crm/leads/:leadId/notes` is always set from `req.user.id`, never from `req.body`
  - **Requirement:** 4.1, 4.4, 4.5
  - **Files:** `apps/api/src/crm/notes/NoteService.ts`, `apps/api/src/controllers/crmController.ts`

- [ ] 11. Add notes routes and handlers for contacts and companies
  - Add `NoteService.listForContact(orgId, contactId, page, limit)` method: `NoteModel.find({ organizationId: orgId, contactId }).sort({ isPinned: -1, createdAt: -1 }).skip(skip).limit(limit)`
  - Add `NoteService.listForCompany(orgId, companyId, page, limit)` method: same pattern with `companyId`
  - Add `listContactNotes` and `listCompanyNotes` handlers to `crmController.ts`
  - Register `router.get('/contacts/:contactId/notes', authorize(...ALL_ROLES), listContactNotes)` in `crm.routes.ts`
  - Register `router.get('/companies/:companyId/notes', authorize(...ALL_ROLES), listCompanyNotes)` in `crm.routes.ts`
  - Both responses must include `meta: { total, page, limit, totalPages }`
  - **Requirement:** 4.2, 4.3, 4.6
  - **Files:** `apps/api/src/crm/notes/NoteService.ts`, `apps/api/src/controllers/crmController.ts`, `apps/api/src/routes/crm.routes.ts`

- [ ] 12. Replace regex search with `$text` index in `SearchService` and add pagination
  - Open `apps/api/src/crm/search/SearchService.ts`
  - Replace Lead and Contact queries with `$text: { $search: query }` + `{ score: { $meta: 'textScore' } }` projection, sorted by text score descending
  - Keep regex fallback for Tasks and Notes (no text index on those collections)
  - Add `page` and `limit` query params (default `page: 1`, `limit: 10`, max `limit: 50`); apply `.skip(skip).limit(limit)` to each entity query
  - Add a separate `countDocuments` call per entity to support `totalPages`
  - Add `url` field to each result: `/leads/:id`, `/contacts/:id`, `/tasks/:id`, `/notes/:id`
  - Return `{ status: 'ok', data: { results, byEntity }, total, page, limit, totalPages }`
  - **Requirement:** 5.1, 5.2, 5.3, 5.4, 5.5
  - **File:** `apps/api/src/crm/search/SearchService.ts`

- [ ] 13. Fix `PipelineService` — stage rename syncs leads, delete guards, and `getById` returns stage counts
  - In `PipelineService.updateStage`: after saving the pipeline, if `patch.name` is set, call `LeadModel.updateMany({ organizationId, pipelineId, stageId }, { $set: { stageName: patch.name } })`
  - In `PipelineService.deleteStage`: before deleting, call `LeadModel.countDocuments({ organizationId, pipelineId, stageId })`; if count > 0, throw `ApiError(409, ..., 'STAGE_HAS_LEADS')`
  - In `PipelineService.getById`: after loading the pipeline, run a single `LeadModel.aggregate` to count leads per `stageId`; add `stageCounts: { [stageId]: count }` to the returned object
  - **Requirement:** 6.1, 6.2, 6.3
  - **File:** `apps/api/src/crm/pipeline/PipelineService.ts`

- [ ] 14. Fix Kanban to group by `stageId` and validate stage on `moveStage`
  - In `LeadService.kanban`: change grouping key from `doc.stageName ?? 'Unassigned'` to `doc.stageId ?? 'unassigned'`
  - In `LeadService.moveStage`: load the pipeline document; verify `dto.stageId` exists in `pipeline.stages`; if not, throw `ApiError(422, ..., 'INVALID_STAGE_REFERENCE')`
  - **Requirement:** 6.4, 6.5
  - **File:** `apps/api/src/services/LeadService.ts`

- [ ] 15. Create `DashboardCacheService` and wire cache invalidation into mutations
  - Create `apps/api/src/utils/DashboardCacheService.ts` with a single exported function `invalidateOrg(orgId: string): void` that calls the existing cache invalidation mechanism (fire-and-forget, never throws)
  - In `LeadService.create`, `LeadService.update`, `LeadService.delete`: add `DashboardCacheService.invalidateOrg(organizationId)` call after the mutation succeeds
  - In `ConversationService.create`, `ConversationService.delete`: add the same call
  - **Requirement:** 7.1, 7.2
  - **Files:** `apps/api/src/utils/DashboardCacheService.ts` (new), `apps/api/src/services/LeadService.ts`, `apps/api/src/services/ConversationService.ts`

- [ ] 16. Fix `CrmDashboardService.ownerPerformance` task count
  - Open the `CrmDashboardService` file (located in `apps/api/src/dashboard/crm/`)
  - Add a `TaskModel.aggregate` call to count open tasks per `ownerId`: `[{ $match: { organizationId, status: { $ne: 'completed' } } }, { $group: { _id: '$ownerId', count: { $sum: 1 } } }]`
  - Build a `taskCountMap` and replace the hardcoded `tasks: 0` with `taskCountMap[owner.ownerId] ?? 0`
  - **Requirement:** 7.3
  - **File:** `apps/api/src/dashboard/crm/CrmDashboardService.ts`

- [ ] 17. Remove HVAC-specific seed data from `OrganizationService.seedDefaults`
  - Open `apps/api/src/services/OrganizationService.ts`
  - Change the `services` array in the seeded `Business` document to `[]`
  - Change the default AI welcome message to `'Welcome! How can I help you today?'`
  - Remove the 4 HVAC service objects (`AC Repair`, `Heating Repair`, `HVAC Maintenance`, `System Replacement`) — do not replace with other service names
  - **Requirement:** 8.1, 8.6
  - **File:** `apps/api/src/services/OrganizationService.ts`

- [ ] 18. Remove hardcoded `Appointment.type` enum
  - In `apps/api/src/models/Appointment.model.ts`: change `type` field from `{ type: String, enum: [...], required: true }` to `{ type: String, required: true, trim: true }` — remove the `enum` array entirely
  - In `apps/api/src/dto/appointment.dto.ts`: change `type: z.enum([...])` to `type: z.string().min(1).trim()`
  - The `inferType` function in `widgetController.ts` returns string values — no change needed there; it continues to work as a suggestion helper
  - **Requirement:** 8.2, 8.3, 8.4
  - **Files:** `apps/api/src/models/Appointment.model.ts`, `apps/api/src/dto/appointment.dto.ts`

- [ ] 19. Rename `Lead.hvacNeed` to `serviceNeed` using Mongoose alias
  - In `apps/api/src/models/Lead.model.ts`: rename the field property from `hvacNeed` to `serviceNeed` and add `alias: 'hvacNeed'` to the field definition so the MongoDB storage key is unchanged
  - Update `ILead` interface and `LeadDocument` to use `serviceNeed`
  - Update `apps/api/src/types/index.ts` `Lead` interface to use `serviceNeed`
  - Update `apps/api/src/dto/lead.dto.ts` `CreateLeadSchema` and `UpdateLeadSchema` to use `serviceNeed`
  - Search all TypeScript files in `apps/api/src` for references to `hvacNeed` on lead objects and update to `serviceNeed` (widget controller, conversation service, lead service, crm dashboard, AI orchestrator, etc.)
  - **Requirement:** 8.5
  - **Files:** `apps/api/src/models/Lead.model.ts`, `apps/api/src/types/index.ts`, `apps/api/src/dto/lead.dto.ts`, and all files referencing `lead.hvacNeed`

- [ ] 20. Improve duplicate key error response in `errorHandler`
  - Open `apps/api/src/middleware/errorHandler.ts`
  - In the MongoDB duplicate key handler (code 11000/11001), extract the conflicting field name from `mongoErr.keyPattern` (e.g. `Object.keys(mongoErr.keyPattern ?? {}).join(', ')`) and include it in the response message: `'Duplicate value for field(s): ${fieldName}'`
  - **Requirement:** 9.5
  - **File:** `apps/api/src/middleware/errorHandler.ts`

- [ ] 21. Add parent entity validation to `NoteService.create`
  - Open `apps/api/src/crm/notes/NoteService.ts`
  - Import `LeadModel`, `ContactModel`, `CompanyModel`
  - At the start of `create`: if `leadId`, `contactId`, and `companyId` are all null/absent, throw `ApiError(422, 'A note must be attached to at least one parent entity', 'NOTE_MISSING_PARENT', { field: 'leadId' })`
  - For each non-null reference field, call `Model.exists({ _id: id, organizationId })` in parallel via `Promise.all`; if any resolves to null, throw `ApiError(422, 'Referenced <field> does not exist', 'INVALID_REFERENCE', { field })`
  - **Requirement:** 11.1, 11.2, 11.8, 11.11
  - **File:** `apps/api/src/crm/notes/NoteService.ts`

- [ ] 22. Add `leadId` existence check to `AppointmentService.create`
  - Open `apps/api/src/services/AppointmentService.ts`
  - Import `LeadModel`
  - At the start of `create`: if `dto.leadId` is non-null, call `LeadModel.exists({ _id: dto.leadId, organizationId })`; if null, throw `ApiError(422, 'Referenced lead does not exist', 'INVALID_REFERENCE', { field: 'leadId' })`
  - **Requirement:** 11.3, 11.8, 11.11
  - **File:** `apps/api/src/services/AppointmentService.ts`

- [ ] 23. Add `leadId` existence check to `ConversationService.create`
  - Open `apps/api/src/services/ConversationService.ts`
  - Import `LeadModel`
  - At the start of `create`: if `dto.leadId` is non-null, call `LeadModel.exists({ _id: dto.leadId, organizationId })`; if null, throw `ApiError(422, 'Referenced lead does not exist', 'INVALID_REFERENCE', { field: 'leadId' })`
  - **Requirement:** 11.4, 11.8, 11.11
  - **File:** `apps/api/src/services/ConversationService.ts`

- [ ] 24. Add `companyId` and `leadIds` validation to `ContactService`
  - Open `apps/api/src/crm/contacts/ContactService.ts`
  - In both `create` and `update`: if `companyId` is non-null, call `CompanyModel.exists({ _id: companyId, organizationId })`; if null, throw `ApiError(422, 'Referenced company does not exist', 'INVALID_REFERENCE', { field: 'companyId' })`
  - In both `create` and `update`: if `leadIds` is a non-empty array, call `LeadModel.countDocuments({ _id: { $in: leadIds }, organizationId })`; if count differs from `leadIds.length`, throw `ApiError(422, 'One or more referenced leads do not exist', 'INVALID_REFERENCE', { field: 'leadIds' })`
  - **Requirement:** 11.5, 11.6, 11.8, 11.11
  - **File:** `apps/api/src/crm/contacts/ContactService.ts`

- [ ] 25. Add pipeline/stage validation to `LeadService.create`
  - Open `apps/api/src/services/LeadService.ts`
  - In `create`: if exactly one of `pipelineId` or `stageId` is present (but not both), throw `ApiError(422, 'pipelineId and stageId must both be supplied together', 'INVALID_REFERENCE', { field: 'pipelineId' })`
  - If both are present, load `PipelineModel.findOne({ _id: pipelineId, organizationId })`; if not found or `pipeline.stages` has no entry with `id === stageId`, throw `ApiError(422, 'Referenced pipeline or stage does not exist', 'INVALID_REFERENCE', { field: 'pipelineId' })`
  - **Requirement:** 11.7, 11.8, 11.11
  - **File:** `apps/api/src/services/LeadService.ts`

- [ ] 26. Add Activity cleanup to lead cascade delete
  - In `LeadService.delete`, add `ActivityModel.updateMany({ organizationId, leadId: id }, { $set: { leadId: null } })` to the existing `Promise.allSettled` cleanup batch
  - Import `ActivityModel`
  - **Requirement:** 11.12
  - **File:** `apps/api/src/services/LeadService.ts`

- [ ] 27. Add existence checks to `ActivityService.log`
  - Open `apps/api/src/crm/activities/ActivityService.ts`
  - Before inserting, run parallel `Model.exists` checks for non-null `leadId`, `contactId`, `companyId`
  - If a check returns null (document not found or wrong org), emit a `warn` log with `{ event: 'activity.invalid_reference', field, organizationId }` and return early without inserting the Activity
  - Use `Promise.allSettled` so that a DB error on one check does not block the others
  - **Requirement:** 11.9
  - **File:** `apps/api/src/crm/activities/ActivityService.ts`

- [ ] 28. Add target-not-found guard to `AutomationService` lead-mutation actions
  - Open `apps/api/src/crm/automation/AutomationService.ts`
  - In `executeAction`, before the switch cases `assign_owner`, `update_score`, `move_stage`, `add_tag`, `remove_tag`: if `leadId` is provided, call `LeadModel.exists({ _id: leadId, organizationId })`; if null, emit `logger.warn({ event: 'automation.target_not_found', leadId, organizationId, actionType })` and `break` (skip the action); do not throw
  - **Requirement:** 11.10
  - **File:** `apps/api/src/crm/automation/AutomationService.ts`

- [ ] 29. Verify build compiles and run existing tests
  - Run `npm run build` (or `tsc --noEmit`) in `apps/api`
  - Fix all TypeScript errors, particularly around the `serviceNeed`/`hvacNeed` alias rename (task 19), note service signature changes (task 10), and new model imports in tasks 21–28
  - Run `npm test` if a test suite exists; fix any broken tests
  - **File:** `apps/api`

---

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": [1, 7, 17, 18, 20],
      "description": "Schema/DTO changes and standalone fixes — no inter-task dependencies"
    },
    {
      "wave": 2,
      "tasks": [2, 8, 10, 12, 13, 16, 19, 21, 22, 23, 24, 25, 27, 28],
      "description": "Service logic changes — depend on wave 1 DTOs; tasks within this wave are independent of each other"
    },
    {
      "wave": 3,
      "tasks": [3, 4, 5, 6, 9, 11, 14, 15, 26],
      "description": "Controller, route, and cross-service wiring — depend on wave 2 service changes"
    },
    {
      "wave": 4,
      "tasks": [29],
      "description": "Build verification — terminal task, depends on all previous waves"
    }
  ]
}
```

---

## Notes

- Tasks 2, 5, 14, 15, 25, and 26 all modify `LeadService.ts` — do them in a single pass to avoid conflicts.
- Tasks 8, 9, and 23 modify `ConversationService.ts` — do them together.
- Tasks 10 and 21 both modify `NoteService.ts` — do them together.
- Task 19 (`hvacNeed` → `serviceNeed`) touches many files across the codebase. Run `grep -r "hvacNeed" apps/api/src` after completing the task to verify no references are missed.
- The Kanban grouping change in task 14 is a breaking change for any consumer that keys on stage names. The design stores `stageName` on each lead object for display, but the grouping key becomes `stageId`. Document this in the API changelog before deployment.
- The `Appointment.type` enum removal (task 18) is backward-compatible for existing MongoDB documents. Any frontend that validates the enum client-side will need to be updated in a subsequent sprint.
- `DashboardCacheService.invalidateOrg` (task 15) must be fire-and-forget. If it throws, the mutation must still return success. Wrap in `.catch(() => {})` or equivalent.
- Tasks 21–28 (Requirement 11) all use `Model.exists({ _id, organizationId })` as the validation primitive. This returns `null` for both non-existent documents and cross-org documents — intentionally indistinguishable per Requirement 11.8.
- `ActivityService.log` (task 27) uses warn-and-skip semantics — validation failure must never throw or interrupt the caller. All checks run via `Promise.allSettled`.
- `AutomationService` (task 28) uses break-and-log semantics — validation failure skips the action, does not abort the overall automation run.
