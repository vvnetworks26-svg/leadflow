# Requirements Document

## Introduction

This sprint makes every CRM screen production-ready. The scope covers the API layer and the data contracts it exposes. Work is confined to correctness, completeness, and reliability — no new UI screens, no redesigns, no new features beyond what is required to make existing screens function correctly in production.

Specifically:

- Lead CRUD must be complete, correctly paginated, sorted, and filtered with no missing linked data.
- Conversation CRUD must support deletion and correct bidirectional linking to leads.
- Notes must enforce authorship and be accessible from all entity types that reference them.
- Search must use indexed queries, support pagination, and return results in a deterministic order.
- Linked appointments and conversations must be navigable from the lead record.
- Dashboard data must reflect live database state without stale cached counts.
- All HVAC-specific hardcoded seed data that appears in every new tenant must be removed or made configurable.
- Every list endpoint must return consistent pagination metadata and honour sort parameters.

No frontend changes are in scope. All work is in `apps/api`.

---

## Glossary

- **Lead**: A `Lead` MongoDB document representing a prospective customer, scoped to an `organizationId`.
- **Conversation**: A `Conversation` MongoDB document recording a chat transcript linked to a Lead.
- **Note**: A `Note` MongoDB document representing a human-authored or AI-generated annotation attached to a Lead, Contact, or Company.
- **Activity**: An immutable `Activity` MongoDB document recording a lifecycle event on a Lead. Not editable or deletable.
- **Contact**: A `Contact` MongoDB document representing a deduplicated person entity, potentially linked to multiple Leads.
- **Pipeline**: A `Pipeline` MongoDB document containing an ordered array of stages. Each Lead may reference a pipeline and stage.
- **SavedFilter**: A persisted user-defined query preset for a list screen.
- **PaginatedResult**: The response shape `{ data: T[], total, page, limit, totalPages }` returned by all list endpoints.
- **orgId**: The `organizationId` string derived from the authenticated JWT — never trusted from the request body.
- **AGENT_AND_ABOVE**: Roles `agent`, `manager`, `admin`, `owner`.
- **OWNER_ADMIN**: Roles `admin`, `owner`.
- **Demo data**: Hardcoded tenant-specific seed content (HVAC service names, appointment type enums, AI knowledge entries) that is applied to every new organization regardless of industry.

---

## Requirements

### Requirement 1: Lead List — Filters, Sort, and Pagination

**User Story:** As a CRM user, I want to filter the lead list by date ranges and follow-up dates, receive correctly paginated results with accurate totals, and sort by any lead field, so that I can efficiently work my pipeline without missing leads.

#### Acceptance Criteria

1. WHEN `GET /leads` is called with `createdAfter` and/or `createdBefore` query parameters (ISO 8601 date strings), THE `LeadService.list` method SHALL apply `{ createdAt: { $gte, $lte } }` filter conditions so that only leads created within the specified range are returned.
2. WHEN `GET /leads` is called with a `followUpBefore` query parameter (ISO 8601 date string), THE `LeadService.list` method SHALL filter leads where `nextFollowUpAt` is not null and is less than or equal to the supplied date.
3. WHEN `GET /leads` is called without a `sortBy` parameter, THE `LeadService.list` method SHALL default to sorting by `createdAt` descending so that the most recently created leads appear first.
4. WHEN `GET /leads` returns a paginated response, THE response body SHALL include `total`, `page`, `limit`, and `totalPages` fields alongside the `data` array, where `totalPages` equals `Math.ceil(total / limit)`.
5. WHEN `GET /leads` is called with `limit` greater than 100, THE `LeadService.list` method SHALL cap the limit at 100 and return at most 100 records per page.
6. WHEN `GET /leads` is called with an invalid `sortBy` field that does not exist on the Lead model, THE `LeadService.list` method SHALL fall back to sorting by `createdAt` descending rather than passing the invalid field to MongoDB.
7. THE `LeadQuerySchema` DTO SHALL be updated to include `createdAfter`, `createdBefore`, and `followUpBefore` as optional ISO date string fields, validated with `z.string().datetime({ offset: true }).optional()`.

### Requirement 2: Lead CRUD — Correctness and Linked Data

**User Story:** As a CRM user, I want lead create, read, update, and delete to behave consistently, and I want a lead's linked appointments and conversations to be accessible from the lead record, so that I never need to manually cross-reference IDs.

#### Acceptance Criteria

1. WHEN `GET /leads/:id` is called and the lead has an `appointmentId` value, THE response SHALL include an `appointment` field containing the full Appointment document fetched by `AppointmentService.getById`; IF the referenced appointment does not exist, THE `appointment` field SHALL be `null` and no error SHALL be thrown.
2. WHEN `GET /leads/:id` is called and the lead has a `conversationId` value, THE response SHALL include a `conversation` field containing the full Conversation document fetched by `ConversationService.getById`; IF the referenced conversation does not exist, THE `conversation` field SHALL be `null` and no error SHALL be thrown.
3. THE `GET /leads/:id/appointments` route SHALL exist and return a `PaginatedResult` of all Appointment documents where `leadId` equals the requested lead's `_id`, scoped to `organizationId`, sorted by `date` descending.
4. THE `GET /leads/:id/conversations` route SHALL exist and return a `PaginatedResult` of all Conversation documents where `leadId` equals the requested lead's `_id`, scoped to `organizationId`, sorted by `lastMessageAt` descending.
5. WHEN `DELETE /leads/:id` is called by a user with `OWNER_ADMIN` role, THE handler SHALL also delete all Note documents where `leadId` equals the deleted lead's `_id`, all Activity documents where `leadId` equals the deleted lead's `_id`, and unset `leadId` on any Conversation documents that reference this lead — all in parallel before returning HTTP 204.
6. WHEN `PATCH /leads/:id` is called with an `appointmentId` field in the request body, THE handler SHALL verify the referenced Appointment exists and belongs to the same `organizationId`; IF it does not exist, THE handler SHALL return HTTP 422 with error code `INVALID_APPOINTMENT_REFERENCE`.
7. THE `Lead.appointmentId` field SHALL remain a single scalar string on the Lead document; THE `GET /leads/:id/appointments` route (criterion 3) is the correct path for discovering all appointments linked to a lead by `leadId`.

### Requirement 3: Conversation CRUD — Delete and Search

**User Story:** As a CRM user, I want to delete conversations that are no longer relevant, search across conversation content, and filter by date ranges, so that my conversation list stays clean and navigable.

#### Acceptance Criteria

1. THE `DELETE /conversations/:id` route SHALL exist, require `AGENT_AND_ABOVE` role, and call a `ConversationService.delete(orgId, id)` method that removes the Conversation document and emits an `Activity` record of type `stage_changed` with title `Conversation deleted`.
2. WHEN `ConversationService.delete` is called and the referenced Lead has `conversationId` equal to the deleted conversation's `_id`, THE service SHALL unset `Lead.conversationId` on that lead document before returning.
3. WHEN `GET /conversations` is called with a `search` query parameter, THE `ConversationService.list` method SHALL search across `leadName`, `leadPhone`, and `hvacNeed` fields using a case-insensitive regex; it SHALL NOT search message content (message content is not indexed).
4. WHEN `GET /conversations` is called with `createdAfter` and/or `createdBefore` query parameters (ISO 8601 date strings), THE `ConversationService.list` method SHALL apply `{ createdAt: { $gte, $lte } }` filter conditions.
5. WHEN `GET /conversations` is called with an `appointmentId` query parameter, THE `ConversationService.list` method SHALL filter conversations where `appointmentId` equals the supplied value.
6. WHEN `GET /conversations` returns a paginated response, THE response body SHALL include `total`, `page`, `limit`, and `totalPages` fields alongside the `data` array.
7. THE `ConversationQuerySchema` DTO SHALL be updated to include `createdAfter`, `createdBefore`, and `appointmentId` as optional fields.

### Requirement 4: Notes — Authorship, Accessibility, and Correctness

**User Story:** As a CRM user, I want notes to be editable only by their author or an admin, viewable from any entity (lead, contact, company) they are attached to, and correctly paginated, so that sensitive annotations are protected and notes are always discoverable.

#### Acceptance Criteria

1. WHEN `PATCH /crm/leads/:leadId/notes/:noteId` is called by a user whose `userId` does not equal `Note.authorId` AND whose role is not `admin` or `owner`, THE `NoteService.update` method SHALL return HTTP 403 with error code `NOTE_AUTHOR_REQUIRED`; THE database query SHALL include `{ _id: noteId, organizationId: orgId }` and the role check SHALL be enforced in application code before the update is issued.
2. THE `GET /crm/contacts/:contactId/notes` route SHALL exist, require `ALL_ROLES`, and return a `PaginatedResult` of Note documents where `contactId` equals the requested contact's `_id`, sorted with pinned notes first then `createdAt` descending.
3. THE `GET /crm/companies/:companyId/notes` route SHALL exist, require `ALL_ROLES`, and return a `PaginatedResult` of Note documents where `companyId` equals the requested company's `_id`, sorted with pinned notes first then `createdAt` descending.
4. WHEN `POST /crm/leads/:leadId/notes` is called, THE handler SHALL set `Note.authorId` to the authenticated user's `userId` from the JWT, not from the request body; any `authorId` supplied in the request body SHALL be silently ignored.
5. WHEN `DELETE /crm/leads/:leadId/notes/:noteId` is called by a user whose `userId` does not equal `Note.authorId` AND whose role is not `admin` or `owner`, THE handler SHALL return HTTP 403 with error code `NOTE_AUTHOR_REQUIRED`.
6. WHEN `GET /crm/leads/:leadId/notes` is called, THE response SHALL include `total`, `page`, `limit`, and `totalPages` pagination fields alongside the `data` array.

### Requirement 5: CRM Search — Indexed, Paginated, and Sorted

**User Story:** As a CRM user, I want the global CRM search to return results quickly using database indexes, to support pagination for large result sets, and to return results ordered consistently, so that I can find any record without scanning manually.

#### Acceptance Criteria

1. WHEN `GET /crm/search` is called with a `query` parameter, THE `SearchService` SHALL use MongoDB `$text` search on the Lead and Contact collections (which have text indexes defined) rather than per-field regex scans; regex fallback is permitted only for collections without a text index (tasks, notes).
2. WHEN `GET /crm/search` is called, THE response SHALL support `page` and `limit` query parameters; THE `SearchService` SHALL apply `skip` and `limit` to each entity query so that result sets are bounded and paginated; THE response SHALL include `total`, `page`, `limit`, and `totalPages` fields.
3. WHEN `GET /crm/search` is called, THE results within each entity type SHALL be sorted by `createdAt` descending so that newer records appear before older ones for equivalent text matches.
4. WHEN `GET /crm/search` is called with an `entities` parameter that includes `leads`, THE `SearchService` SHALL apply `{ organizationId: orgId }` as a mandatory filter on the Lead query so that results from other organizations are never returned.
5. WHEN `GET /crm/search` returns results, each result object SHALL include a `url` field containing the relative path to the record (e.g. `/leads/:id`, `/contacts/:id`) so that the frontend can navigate to the record without constructing the URL itself.

### Requirement 6: Pipeline and Kanban — Stage Integrity

**User Story:** As a CRM manager, I want pipeline stage assignments on leads to remain correct when stages are renamed or deleted, and I want accurate lead counts per stage without querying the full lead list, so that the Kanban board always reflects the real state of my pipeline.

#### Acceptance Criteria

1. WHEN `PATCH /crm/pipelines/:id/stages/:stageId` is called to rename a stage (updating the `name` field), THE `PipelineService.updateStage` method SHALL also issue a `LeadModel.updateMany({ organizationId: orgId, pipelineId: pipelineId, stageId: stageId }, { stageName: newName })` so that all leads referencing that stage have their `stageName` field updated atomically.
2. WHEN `DELETE /crm/pipelines/:id/stages/:stageId` is called, THE `PipelineService.deleteStage` method SHALL check whether any leads exist with `{ organizationId: orgId, pipelineId: pipelineId, stageId: stageId }`; IF such leads exist, THE method SHALL return HTTP 409 with error code `STAGE_HAS_LEADS` and SHALL NOT delete the stage; the caller must first move those leads to another stage.
3. WHEN `GET /crm/pipelines/:id` is called, THE response SHALL include a `stageCounts` object mapping each `stageId` to the count of leads currently in that stage, derived from a single `LeadModel.aggregate` call rather than N individual count queries.
4. WHEN `GET /crm/kanban/:pipelineId` is called, THE response SHALL group leads by `stageId` (not `stageName`) so that a stage rename does not silently break grouping; the `stageName` field MAY be included in each lead object for display purposes.
5. WHEN `PATCH /crm/leads/:id/stage` is called and the supplied `stageId` does not exist in the pipeline's `stages` array for the specified `pipelineId`, THE handler SHALL return HTTP 422 with error code `INVALID_STAGE_REFERENCE` rather than silently writing an orphaned stage reference.

### Requirement 7: Dashboard Data Accuracy

**User Story:** As a business owner, I want the CRM dashboard to reflect the current state of my database within one page load after a mutation, so that I never make decisions based on stale counts.

#### Acceptance Criteria

1. WHEN a Lead is created, updated, or deleted via any API endpoint, THE `DashboardService` cache entry for that organization SHALL be invalidated; invalidation SHALL be fire-and-forget and SHALL NOT block or fail the primary mutation response.
2. WHEN a Conversation is created or deleted via any API endpoint, THE `DashboardService` cache entry for that organization SHALL be invalidated using the same fire-and-forget pattern.
3. WHEN `GET /dashboard/crm` is called, THE `CrmDashboardService.ownerPerformance` calculation SHALL return the correct `tasks` count per owner by querying `TaskModel.countDocuments({ organizationId, ownerId, status: { $ne: 'completed' } })` for each owner; the hardcoded value `tasks: 0` SHALL be removed.
4. WHEN the cache TTL for a dashboard entry expires and a fresh database query is issued, THE query SHALL complete within 3 seconds under normal MongoDB Atlas load; IF the query exceeds 3 seconds, THE `DashboardService` SHALL return the stale cached value rather than timing out the HTTP request, and SHALL emit a structured warning log entry.
5. WHEN `POST /dashboard/cache/invalidate` is called by an `OWNER_ADMIN` user, THE handler SHALL accept an optional `section` query parameter (one of: `crm`, `sales`, `bookings`, `overview`, `all`) and invalidate only the specified section's cache; IF no `section` is provided, ALL dashboard cache entries for the organization SHALL be invalidated.

### Requirement 8: Hardcoded Demo Data Removal

**User Story:** As a new tenant onboarding to LeadFlow, I want my account to start with industry-neutral defaults, not HVAC-specific service names and appointment types, so that the CRM does not show irrelevant placeholder content from day one.

#### Acceptance Criteria

1. THE `OrganizationService.seedDefaults` method SHALL NOT seed any HVAC-specific service names (`AC Repair`, `Heating Repair`, `HVAC Maintenance`, `System Replacement`) into the new organization's `Business` document; instead, the `services` array SHALL be seeded as empty (`[]`) so that the business owner adds their own services.
2. THE `Appointment.type` field enum SHALL be replaced with a free-text `String` field with a `minlength: 1` constraint, removing the hardcoded HVAC values (`Maintenance`, `Repair Consultation`, `System Replacement Quote`, `Emergency Service`); existing Appointment documents with the old enum values SHALL remain valid after the schema change.
3. THE `CreateAppointmentSchema` and `UpdateAppointmentSchema` in `appointment.dto.ts` SHALL replace the `z.enum([...])` on the `type` field with `z.string().min(1).trim()`.
4. THE `inferType` function in `widgetController.ts` SHALL be preserved as a utility that produces a suggested appointment type string from the service description and emergency flag; it SHALL continue to return string values but those values are no longer constrained to the removed enum.
5. THE `Lead.hvacNeed` field SHALL be renamed to `Lead.serviceNeed` in the model, schema, DTO, and all usages across the codebase; the field SHALL retain its existing `String` type and default value of `'General inquiry'`; the MongoDB field name stored on disk SHALL remain `hvacNeed` via a Mongoose `select` alias to avoid a data migration, OR a migration script SHALL be provided.
6. THE `OrganizationService.seedDefaults` AI welcome message SHALL use a generic placeholder (`'Welcome! How can I help you today?'`) rather than a message that references HVAC terminology.

### Requirement 9: Error Handling Consistency

**User Story:** As a frontend developer consuming the CRM API, I want every error response to use a consistent JSON shape so that I can write a single error-handling utility that works across all CRM endpoints.

#### Acceptance Criteria

1. EVERY error response from any route under `/api/v1/leads`, `/api/v1/conversations`, `/api/v1/crm`, and `/api/v1/dashboard` SHALL use the shape `{ status: 'error', code: string, message: string }` where `code` is a SCREAMING_SNAKE_CASE identifier and `message` is a human-readable English string.
2. WHEN a request supplies an ID that does not resolve to a document within the authenticated organization (e.g. `GET /leads/:id` where the lead exists but belongs to a different org), THE handler SHALL return HTTP 404 with `code: 'NOT_FOUND'`; it SHALL NOT return HTTP 403 or leak the existence of the record to the caller.
3. WHEN any list endpoint (`GET /leads`, `GET /conversations`, `GET /crm/search`) receives a `page` parameter that is less than 1 or not an integer, THE handler SHALL return HTTP 422 with `code: 'VALIDATION_ERROR'` and a message identifying the offending parameter.
4. WHEN `LeadService`, `ConversationService`, `NoteService`, or `PipelineService` throws an unhandled error that is not an `ApiError` instance, THE central `errorHandler` middleware SHALL catch it, log it at `error` level with the `requestId`, and return HTTP 500 with `code: 'INTERNAL_SERVER_ERROR'`; the raw error message and stack SHALL NOT appear in the response body.
5. WHEN a Mongoose duplicate key error (code 11000) is thrown by any CRM write operation other than the booking flow, THE `errorHandler` middleware SHALL return HTTP 409 with `code: 'DUPLICATE_RESOURCE'` and a message that identifies the conflicting field name extracted from the error's `keyPattern`.

### Requirement 10: Pagination Consistency Across All List Endpoints

**User Story:** As a frontend developer, I want every list endpoint to return the same pagination envelope so that I can reuse a single data-fetching hook across all CRM screens.

#### Acceptance Criteria

1. EVERY list endpoint in the CRM (`GET /leads`, `GET /conversations`, `GET /crm/search`, `GET /crm/timeline/:leadId`, `GET /crm/activities`, `GET /crm/leads/:leadId/notes`, `GET /crm/contacts/:contactId/notes`, `GET /crm/companies/:companyId/notes`) SHALL return a response body matching the shape: `{ status: 'ok', data: T[], total: number, page: number, limit: number, totalPages: number }`.
2. WHEN any list endpoint is called without `page` or `limit` parameters, THE endpoint SHALL default to `page: 1` and `limit: 20`.
3. WHEN any list endpoint is called with `limit: 0`, THE handler SHALL return HTTP 422 with `code: 'VALIDATION_ERROR'` rather than returning an unbounded query result.
4. THE `paginated()` utility function in `apps/api/src/utils/query.ts` SHALL be updated to accept and return a `totalPages` field computed as `Math.ceil(total / limit)`, and all existing callers of `paginated()` SHALL be updated to include `totalPages` in their responses.
5. WHEN a `page` value is requested that exceeds `totalPages` (e.g. page 5 of a 3-page result set), THE endpoint SHALL return HTTP 200 with an empty `data` array and the correct `total`, `page`, `limit`, and `totalPages` values — it SHALL NOT return HTTP 404 or an error.

### Requirement 11: Data Integrity & Referential Consistency

**User Story:** As a CRM administrator, I want every entity relationship to be validated before it is persisted, so that the database never contains references to non-existent or cross-organization records and the CRM dashboard always shows accurate, internally consistent data.

#### Acceptance Criteria

1. WHEN `NoteService.create` is called, THE service SHALL verify that at least one of `leadId`, `contactId`, or `companyId` is a non-null non-empty string; IF all three are null or absent, THE service SHALL throw `ApiError(422, 'A note must be attached to at least one parent entity', 'NOTE_MISSING_PARENT')` without creating any document.

2. WHEN `NoteService.create` is called with a non-null `leadId`, THE service SHALL call `LeadModel.exists({ _id: leadId, organizationId })` before inserting the Note; IF no matching Lead document exists, THE service SHALL throw `ApiError(422, 'Referenced lead does not exist', 'INVALID_REFERENCE')` without creating any document; the same validation SHALL apply to `contactId` against `ContactModel` and to `companyId` against `CompanyModel`.

3. WHEN `AppointmentService.create` is called with a non-null `leadId`, THE service SHALL call `LeadModel.exists({ _id: leadId, organizationId })` before inserting the Appointment; IF no matching Lead document exists in the same organization, THE service SHALL throw `ApiError(422, 'Referenced lead does not exist', 'INVALID_REFERENCE')` without creating any document.

4. WHEN `ConversationService.create` is called with a non-null `leadId`, THE service SHALL call `LeadModel.exists({ _id: leadId, organizationId })` before inserting the Conversation; IF no matching Lead document exists in the same organization, THE service SHALL throw `ApiError(422, 'Referenced lead does not exist', 'INVALID_REFERENCE')` without creating any document.

5. WHEN `ContactService.create` or `ContactService.update` is called with a non-null `companyId`, THE service SHALL call `CompanyModel.exists({ _id: companyId, organizationId })` before persisting the Contact; IF no matching Company document exists in the same organization, THE service SHALL throw `ApiError(422, 'Referenced company does not exist', 'INVALID_REFERENCE')` without creating or updating any document.

6. WHEN `ContactService.create` or `ContactService.update` is called with a non-empty `leadIds` array, THE service SHALL call `LeadModel.countDocuments({ _id: { $in: leadIds }, organizationId })` and compare the result to `leadIds.length`; IF the counts differ (indicating one or more IDs do not exist in the same organization), THE service SHALL throw `ApiError(422, 'One or more referenced leads do not exist', 'INVALID_REFERENCE')` and include a `field: 'leadIds'` property in the error payload without persisting the document.

7. WHEN `LeadService.create` is called with both `pipelineId` and `stageId` present in the DTO, THE service SHALL verify that a Pipeline document exists with `{ _id: pipelineId, organizationId }` and that its `stages` array contains an entry with `id === stageId`; IF either check fails, THE service SHALL throw `ApiError(422, 'Referenced pipeline or stage does not exist', 'INVALID_REFERENCE')` without creating the Lead; IF only one of `pipelineId` or `stageId` is present without the other, THE service SHALL throw `ApiError(422, 'pipelineId and stageId must both be supplied together', 'INVALID_REFERENCE')`.

8. WHEN any reference validation check in criteria 2–7 above fails because the referenced document exists in the database but its `organizationId` does not match the requesting organization's `organizationId`, THE service SHALL return the same `HTTP 422` response with `code: 'INVALID_REFERENCE'` as for a non-existent document; THE response SHALL NOT reveal whether the document exists in another organization.

9. WHEN `ActivityService.log` is called with a non-null `leadId`, THE service SHALL call `LeadModel.exists({ _id: leadId, organizationId })` before inserting the Activity; IF no matching Lead document exists, THE service SHALL log a structured warning entry at `warn` level with fields `{ event: 'activity.invalid_reference', field: 'leadId', leadId, organizationId }` and SHALL skip the Activity insert rather than persisting an orphaned record; the same validation SHALL apply to non-null `contactId` against `ContactModel` and non-null `companyId` against `CompanyModel`.

10. WHEN an `AutomationService` action of type `assign_owner`, `update_score`, `move_stage`, `add_tag`, or `remove_tag` is about to execute against a `leadId`, THE action executor SHALL call `LeadModel.exists({ _id: leadId, organizationId })` before issuing any update; IF the Lead no longer exists, THE executor SHALL log a structured warning at `warn` level with `{ event: 'automation.target_not_found', leadId, organizationId, actionType }` and SHALL skip that action without throwing or retrying; the overall automation run SHALL continue to the next action.

11. WHEN any of the validation checks in criteria 1–7 prevents a document from being created or updated, THE handler SHALL return `HTTP 422` with a JSON body conforming to the shape `{ status: 'error', code: 'INVALID_REFERENCE', message: string, field: string }` where `field` names the specific DTO property that contained the invalid reference (e.g. `'leadId'`, `'companyId'`, `'leadIds'`, `'pipelineId'`).

12. WHEN a `Lead` is deleted (per the cascade-delete logic defined in Requirement 2.5), THE `LeadService.delete` method SHALL additionally unset the `leadId` field on all `Activity` documents where `leadId` equals the deleted Lead's `_id` by calling `ActivityModel.updateMany({ organizationId, leadId: id }, { $set: { leadId: null } })` as part of the same `Promise.allSettled` cleanup batch; this ensures no Activity record retains a dangling `leadId` reference after the Lead is removed.

13. IF any reference validation check in criteria 2–7 throws an `ApiError(422, ...)` for a `LeadService.create`, `ContactService.create`, `AppointmentService.create`, or `ConversationService.create` call, THEN THE service SHALL NOT call `AutomationService.fire` or `WorkflowEngine.trigger` for that request, and no primary document SHALL exist in the database after the error response is returned to the caller; IF a secondary write — specifically an `ActivityService.log` call or an `AutomationService.fire` call — fails after the primary document has already been successfully persisted, THEN THE primary document SHALL remain in the database and the secondary failure SHALL be handled as fire-and-forget without rolling back or deleting the primary record.
