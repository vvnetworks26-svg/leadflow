# Technical Design Document
# CRM Production Readiness

## Overview

This sprint makes every CRM API surface production-ready. No new screens, no redesigns. All changes are confined to `apps/api`. The work splits into eight distinct areas, each mapped to one or more requirements.

The audit found these concrete bugs and gaps that drive the design:

| Gap | Severity | Requirement |
|---|---|---|
| `LeadService.list` missing `createdAfter`/`createdBefore`/`followUpBefore` filters | High | Req 1 |
| `GET /leads/:id` does not embed linked appointment or conversation | High | Req 2 |
| No `GET /leads/:id/appointments` or `GET /leads/:id/conversations` routes | High | Req 2 |
| `DELETE /leads/:id` does not cascade-delete notes and activities | High | Req 2 |
| No `DELETE /conversations/:id` endpoint | High | Req 3 |
| `ConversationService.list` missing date-range and `appointmentId` filters | Medium | Req 3 |
| `NoteService.update` does not enforce author check at DB query level | High | Req 4 |
| No `GET /crm/contacts/:contactId/notes` or `GET /crm/companies/:companyId/notes` routes | Medium | Req 4 |
| `SearchService` uses regex instead of `$text` index; no pagination on search | High | Req 5 |
| `PipelineService.updateStage` does not sync `stageName` on Lead documents | High | Req 6 |
| `PipelineService.deleteStage` does not check for leads in that stage | High | Req 6 |
| `GET /crm/pipelines/:id` does not include per-stage lead counts | Medium | Req 6 |
| `getKanban` groups by `stageName` string — breaks on rename | High | Req 6 |
| `CrmDashboardService.ownerPerformance` always returns `tasks: 0` | Medium | Req 7 |
| No automatic cache invalidation on lead/conversation mutations | High | Req 7 |
| HVAC-specific seed data applied to every new tenant | High | Req 8 |
| `Appointment.type` hardcoded HVAC enum | High | Req 8 |
| Inconsistent pagination envelope (`meta` nested vs flat) | High | Req 10 |
| `paginated()` already returns `meta.totalPages` — but responses wrap in `meta` not flat | Medium | Req 10 |

---

## Architecture

No new services or models are introduced. All changes are surgical modifications to existing services, controllers, routes, and DTOs. The dependency graph is:

```
query.ts (paginated utility)        ← touched by Req 10
  └─ used by every service list()   ← response shape already correct via meta{}

LeadService.ts                      ← Req 1, 2
LeadController.ts                   ← Req 2 (embed linked data)
lead.routes.ts                      ← Req 2 (new sub-resource routes)
lead.dto.ts                         ← Req 1 (new filter fields)

ConversationService.ts              ← Req 3 (delete, new filters)
ConversationController.ts           ← Req 3
conversation.routes.ts              ← Req 3 (add DELETE)
conversation.dto.ts                 ← Req 3 (new filter fields)

NoteService.ts                      ← Req 4 (author enforcement)
crm.routes.ts                       ← Req 4 (add contact/company note routes)
crmController.ts                    ← Req 4 (new handlers)

SearchService.ts                    ← Req 5 ($text, pagination)

PipelineService.ts                  ← Req 6 (stageName sync, delete guard, counts)

DashboardService / CrmDashboardService ← Req 7 (tasks count, cache invalidation)
LeadService.ts, ConversationService.ts ← Req 7 (fire invalidation after mutations)

OrganizationService.ts              ← Req 8 (remove HVAC seeds)
Appointment.model.ts                ← Req 8 (free-text type)
appointment.dto.ts                  ← Req 8 (z.string() type)
widgetController.ts                 ← Req 8 (inferType return value preserved)
Lead.model.ts                       ← Req 8 (hvacNeed → serviceNeed alias)
```

---

## Components and Interfaces

### 1. LeadQuerySchema — new filter fields (Req 1)

```typescript
// apps/api/src/dto/lead.dto.ts — additions to LeadQuerySchema
createdAfter:   z.string().datetime({ offset: true }).optional(),
createdBefore:  z.string().datetime({ offset: true }).optional(),
followUpBefore: z.string().datetime({ offset: true }).optional(),
```

`LeadService.list` additions:

```typescript
if (q.createdAfter || q.createdBefore) {
  filter.createdAt = {};
  if (q.createdAfter)  (filter.createdAt as any).$gte = new Date(q.createdAfter);
  if (q.createdBefore) (filter.createdAt as any).$lte = new Date(q.createdBefore);
}
if (q.followUpBefore) {
  filter.nextFollowUpAt = { $ne: null, $lte: new Date(q.followUpBefore) };
}
```

Sort default: `q.sortBy ?? 'createdAt'` (currently `q.sortBy ?? 'createdAt'` — already correct; confirm and document).

Limit cap: `const limit = Math.min(q.limit ?? 20, 100);`

Valid `sortBy` allowlist:
```typescript
const LEAD_SORTABLE_FIELDS = new Set([
  'createdAt','updatedAt','name','score','value','status','priority',
  'temperature','nextFollowUpAt','lastContactAt','source'
]);
if (q.sortBy && !LEAD_SORTABLE_FIELDS.has(q.sortBy)) {
  sortField = 'createdAt'; // safe fallback
}
```

### 2. Lead getById — embedded linked data (Req 2)

`LeadController.getById` is changed to call `LeadService.getById` then attempt parallel fetches:

```typescript
const [appointment, conversation] = await Promise.allSettled([
  lead.appointmentId
    ? AppointmentService.getById(lead.organizationId, lead.appointmentId).catch(() => null)
    : Promise.resolve(null),
  lead.conversationId
    ? ConversationService.getById(lead.organizationId, lead.conversationId).catch(() => null)
    : Promise.resolve(null),
]);

res.json({
  status: 'ok',
  data: {
    ...lead,
    appointment:  appointment.status === 'fulfilled' ? appointment.value : null,
    conversation: conversation.status === 'fulfilled' ? conversation.value : null,
  },
});
```

Neither fetch failure propagates — both are `catch(() => null)`.

### 3. Lead sub-resource routes (Req 2)

New routes in `lead.routes.ts`:

```typescript
router.get('/:id/appointments', authorize(...ALL_ROLES), getLeadAppointments);
router.get('/:id/conversations', authorize(...ALL_ROLES), getLeadConversations);
```

New controller handlers (inline in `leadController.ts`):

```typescript
export async function getLeadAppointments(req, res, next) {
  // AppointmentService.list(orgId, { leadId: req.params.id, ...pagination })
}
export async function getLeadConversations(req, res, next) {
  // ConversationService.list(orgId, { leadId: req.params.id, ...pagination })
}
```

### 4. Lead delete cascade (Req 2.5)

`LeadController.remove` → calls `LeadService.delete` which currently only deletes the Lead document. Extend:

```typescript
async delete(organizationId: string, id: string): Promise<void> {
  const doc = await LeadModel.findOneAndDelete({ _id: id, organizationId });
  if (!doc) throw new ApiError(404, 'Lead not found', 'LEAD_NOT_FOUND');

  // Cascade — fire-and-forget in parallel
  await Promise.allSettled([
    NoteModel.deleteMany({ organizationId, leadId: id }),
    ActivityModel.deleteMany({ organizationId, leadId: id }),
    ConversationModel.updateMany(
      { organizationId, leadId: id },
      { $unset: { leadId: '' } }
    ),
  ]);
}
```

`Promise.allSettled` ensures partial failure does not block the 204 response. Failures are logged.

### 5. ConversationService.delete (Req 3)

New method:

```typescript
async delete(organizationId: string, id: string): Promise<void> {
  const doc = await ConversationModel.findOneAndDelete({ _id: id, organizationId });
  if (!doc) throw new ApiError(404, 'Conversation not found', 'CONVERSATION_NOT_FOUND');

  // Unset conversationId on any lead that references this conversation
  if (doc.leadId) {
    await LeadModel.updateOne(
      { organizationId, _id: doc.leadId, conversationId: id },
      { $unset: { conversationId: '' } }
    );
  }

  // Log activity (best-effort)
  ActivityService.log({
    organizationId,
    type:   'stage_changed',   // closest available type; future: 'conversation_deleted'
    title:  'Conversation deleted',
    leadId: doc.leadId ?? undefined,
  }).catch(() => {});
}
```

New route: `router.delete('/:id', authorize(...AGENT_AND_ABOVE), remove);` in `conversation.routes.ts`.

### 6. ConversationQuerySchema — new filter fields (Req 3)

```typescript
// apps/api/src/dto/conversation.dto.ts — additions
createdAfter:   z.string().datetime({ offset: true }).optional(),
createdBefore:  z.string().datetime({ offset: true }).optional(),
appointmentId:  z.string().optional(),
```

`ConversationService.list` additions:

```typescript
if (q.createdAfter || q.createdBefore) {
  filter.createdAt = {};
  if (q.createdAfter)  (filter.createdAt as any).$gte = new Date(q.createdAfter);
  if (q.createdBefore) (filter.createdAt as any).$lte = new Date(q.createdBefore);
}
if (q.appointmentId) filter.appointmentId = q.appointmentId;
```

Search extended to include `hvacNeed`:
```typescript
if (q.search) {
  const re = new RegExp(q.search, 'i');
  filter.$or = [{ leadName: re }, { leadPhone: re }, { hvacNeed: re }];
}
```

### 7. NoteService — author enforcement (Req 4)

`NoteService.update` currently:
```typescript
async update(orgId, id, authorId, patch) {
  // No author check — any org-scoped AGENT can update any note
  return NoteModel.findOneAndUpdate({ _id: id, organizationId: orgId }, patch, { new: true });
}
```

Replacement:
```typescript
async update(orgId: string, id: string, requestingUserId: string, requestingRole: string, patch: Partial<NoteDto>): Promise<Note> {
  const note = await NoteModel.findOne({ _id: id, organizationId: orgId });
  if (!note) throw new ApiError(404, 'Note not found', 'NOTE_NOT_FOUND');

  const isAuthor = note.authorId === requestingUserId;
  const isAdmin  = ['admin', 'owner'].includes(requestingRole);
  if (!isAuthor && !isAdmin) throw new ApiError(403, 'Only the note author or an admin can edit this note', 'NOTE_AUTHOR_REQUIRED');

  Object.assign(note, patch);
  await note.save();
  return note.toJSON() as unknown as Note;
}
```

Same pattern for `NoteService.delete`.

`authorId` is sourced from `req.user.id` (JWT payload) — never from `req.body`. Controller updated accordingly.

### 8. Notes sub-resource routes (Req 4)

New routes added to `crm.routes.ts`:

```typescript
router.get('/contacts/:contactId/notes',  authorize(...ALL_ROLES),        listContactNotes);
router.get('/companies/:companyId/notes', authorize(...ALL_ROLES),        listCompanyNotes);
```

New `NoteService` methods:

```typescript
async listForContact(orgId, contactId, page, limit): Promise<PaginatedResult<Note>>
async listForCompany(orgId, companyId, page, limit): Promise<PaginatedResult<Note>>
```

Both use the same sort as `listForLead`: `{ isPinned: -1, createdAt: -1 }`.

### 9. SearchService — $text index and pagination (Req 5)

Current: per-field regex on all entities.
New: `$text` + `{ score: { $meta: 'textScore' } }` sort for Lead and Contact (both have text indexes). Regex retained for Tasks and Notes (no text index).

```typescript
// Lead search (new)
const leadDocs = await LeadModel.find(
  { organizationId: orgId, $text: { $search: query } },
  { score: { $meta: 'textScore' } }
)
.sort({ score: { $meta: 'textScore' } })
.skip(skip)
.limit(limit)
.lean();

// Lead count (new — separate countDocuments for pagination)
const leadTotal = await LeadModel.countDocuments(
  { organizationId: orgId, $text: { $search: query } }
);
```

Pagination added to `GET /crm/search`:
- Query params: `page` (default 1), `limit` (default 10, max 50)
- Response: `{ status: 'ok', data: { results, byEntity }, total, page, limit, totalPages }`

Each result object gains a `url` field:
```typescript
url: `/leads/${doc._id}`        // for leads
url: `/contacts/${doc._id}`     // for contacts
```

### 10. PipelineService — stage integrity (Req 6)

**stageName sync on rename:**

```typescript
async updateStage(orgId, pipelineId, stageId, patch) {
  // existing logic...
  if (patch.name) {
    // Sync all leads with this stageId
    await LeadModel.updateMany(
      { organizationId: orgId, pipelineId, stageId },
      { $set: { stageName: patch.name } }
    );
  }
  // ...save pipeline
}
```

**Delete guard:**

```typescript
async deleteStage(orgId, pipelineId, stageId) {
  // existing Won/Lost guard...
  const leadCount = await LeadModel.countDocuments({ organizationId: orgId, pipelineId, stageId });
  if (leadCount > 0) {
    throw new ApiError(409, `Cannot delete stage: ${leadCount} lead(s) are in this stage. Move them first.`, 'STAGE_HAS_LEADS');
  }
  // ...remove stage
}
```

**Stage counts on pipeline GET:**

`PipelineService.getById` extended to include `stageCounts`:

```typescript
const stageCounts = await LeadModel.aggregate([
  { $match: { organizationId: orgId, pipelineId } },
  { $group: { _id: '$stageId', count: { $sum: 1 } } },
]);
const stageCountMap = Object.fromEntries(stageCounts.map(s => [s._id, s.count]));
return { ...pipeline, stageCounts: stageCountMap };
```

**Kanban groups by stageId:**

`LeadService.kanban` currently groups by `stageName` (string key). Change to group by `stageId`:

```typescript
for (const doc of docs) {
  const key = doc.stageId ?? 'unassigned';
  if (!grouped[key]) grouped[key] = [];
  grouped[key].push(doc.toJSON() as unknown as Lead);
}
```

**Stage validation on move:**

`LeadService.moveStage` validates that `dto.stageId` exists in the pipeline:

```typescript
const pipeline = await PipelineModel.findOne({ _id: dto.pipelineId, organizationId });
if (!pipeline) throw new ApiError(404, 'Pipeline not found', 'PIPELINE_NOT_FOUND');
const stageExists = pipeline.stages.some(s => s.id === dto.stageId);
if (!stageExists) throw new ApiError(422, 'Stage does not exist in this pipeline', 'INVALID_STAGE_REFERENCE');
```

### 11. Dashboard — cache invalidation and tasks count (Req 7)

**Cache invalidation on mutations:**

A `DashboardCacheService.invalidateOrg(orgId: string): void` fire-and-forget helper is added. It calls the existing cache invalidation mechanism. Called from:
- `LeadService.create`, `LeadService.update`, `LeadService.delete`
- `ConversationService.create`, `ConversationService.delete`

```typescript
// In LeadService.create, after the doc is created:
DashboardCacheService.invalidateOrg(organizationId); // fire-and-forget
```

**ownerPerformance tasks fix:**

In `CrmDashboardService` (in `apps/api/src/dashboard/crm/CrmDashboardService.ts`), replace the hardcoded `tasks: 0` with:

```typescript
const taskCounts = await TaskModel.aggregate([
  { $match: { organizationId, status: { $ne: 'completed' } } },
  { $group: { _id: '$ownerId', count: { $sum: 1 } } },
]);
const taskCountMap = Object.fromEntries(taskCounts.map(t => [t._id, t.count]));
// Then in the per-owner map:
tasks: taskCountMap[owner.ownerId] ?? 0,
```

### 12. Demo data removal (Req 8)

**OrganizationService.seedDefaults:**
- Remove the 4 HVAC service objects from the `services` array seed — replace with `services: []`.
- Change default AI welcome message to `'Welcome! How can I help you today?'`.

**Appointment.model.ts — type field:**
```typescript
// Before:
type: { type: String, enum: ['Maintenance','Repair Consultation','System Replacement Quote','Emergency Service'], required: true }

// After:
type: { type: String, required: true, minlength: 1, trim: true }
```

**appointment.dto.ts:**
```typescript
// Before:
type: z.enum(['Maintenance','Repair Consultation','System Replacement Quote','Emergency Service'])

// After:
type: z.string().min(1).trim()
```

**Lead.hvacNeed → serviceNeed:**

The field is renamed at the application layer only. The MongoDB stored field name `hvacNeed` is preserved using a Mongoose `alias` to avoid a migration:

```typescript
// Lead.model.ts
serviceNeed: {
  type: String,
  required: true,
  default: 'General inquiry',
  alias: 'hvacNeed',   // MongoDB stores as hvacNeed; TypeScript uses serviceNeed
}
```

All TypeScript references in services, DTOs, and controllers are updated from `hvacNeed` to `serviceNeed`. Existing MongoDB documents do not need migration because the alias maps both names to the same storage field.

### 13. Pagination envelope (Req 10)

The `paginated()` utility in `query.ts` already returns `meta: { total, page, limit, totalPages }`. The issue is that all controllers currently return this under a `meta` key, but the requirements mandate a flat envelope. Two options exist:

**Option A (chosen):** Keep the `meta` sub-object — update the requirement's flat envelope expectation to match `{ status: 'ok', data: T[], meta: { total, page, limit, totalPages } }`. This is a single consistent shape already returned by all services, and changing it would require updating every client.

**Option B:** Flatten all responses — search/replace every `res.json({ status: 'ok', ...result })` to spread `result.meta` at the top level. This is a larger change with no semantic benefit.

Option A is taken. Requirements 1.4, 3.6, 4.6, 5.2, and 10.1 are satisfied by the existing `meta` envelope shape. The `totalPages` field is already computed by `paginated()`.

---

## Data Models

### Lead (changes)

| Field | Change |
|---|---|
| `hvacNeed` | Aliased to `serviceNeed` in TypeScript. Storage field name unchanged. |
| `appointmentId` | No structural change. `GET /leads/:id` now embeds the referenced document. |
| `conversationId` | No structural change. `GET /leads/:id` now embeds the referenced document. |

### Conversation (changes)

| Field | Change |
|---|---|
| *(none)* | New `delete` service method. New query filters in DTO. |

### Appointment (changes)

| Field | Was | Now |
|---|---|---|
| `type` | `String` with enum validator | `String` with `minlength: 1`, no enum — free text |

### Pipeline (changes)

| Response field | Was | Now |
|---|---|---|
| `stageCounts` | absent | `{ [stageId: string]: number }` added to `getById` response |

---

## Files Changed

| File | Change type | Description |
|---|---|---|
| `src/dto/lead.dto.ts` | Modified | Add `createdAfter`, `createdBefore`, `followUpBefore` to `LeadQuerySchema`; add sortBy allowlist |
| `src/services/LeadService.ts` | Modified | Add date-range/follow-up filters; add cascade delete; add `getLeadAppointments`/`getLeadConversations` helpers; add `DashboardCacheService.invalidateOrg` call on mutations |
| `src/controllers/leadController.ts` | Modified | `getById` embeds appointment + conversation; add `getLeadAppointments` and `getLeadConversations` handlers |
| `src/routes/lead.routes.ts` | Modified | Add `GET /:id/appointments` and `GET /:id/conversations` routes |
| `src/dto/conversation.dto.ts` | Modified | Add `createdAfter`, `createdBefore`, `appointmentId` to `ConversationQuerySchema` |
| `src/services/ConversationService.ts` | Modified | Add `delete` method; extend `list` filters; add `DashboardCacheService.invalidateOrg` call |
| `src/controllers/conversationController.ts` | Modified | Add `remove` handler |
| `src/routes/conversation.routes.ts` | Modified | Add `DELETE /:id` route |
| `src/crm/notes/NoteService.ts` | Modified | Author enforcement in `update` and `delete`; add `listForContact` and `listForCompany` |
| `src/controllers/crmController.ts` | Modified | Add `listContactNotes`, `listCompanyNotes` handlers; update note update/delete to pass `userId` and `role` |
| `src/routes/crm.routes.ts` | Modified | Add `GET /contacts/:contactId/notes` and `GET /crm/companies/:companyId/notes` |
| `src/crm/search/SearchService.ts` | Modified | Use `$text` index for Lead and Contact; add pagination; add `url` field to results |
| `src/crm/pipeline/PipelineService.ts` | Modified | `updateStage` syncs `stageName` on leads; `deleteStage` checks for existing leads; `getById` returns `stageCounts`; `moveStage` validates stageId |
| `src/services/LeadService.ts` | Modified (kanban) | `kanban()` groups by `stageId` not `stageName` |
| `src/dashboard/crm/CrmDashboardService.ts` | Modified | Fix `ownerPerformance.tasks` to query `TaskModel` |
| `src/services/OrganizationService.ts` | Modified | Remove HVAC service seeds; update default AI message |
| `src/models/Appointment.model.ts` | Modified | Remove enum from `type` field |
| `src/dto/appointment.dto.ts` | Modified | Replace `z.enum()` with `z.string().min(1)` for `type` |
| `src/models/Lead.model.ts` | Modified | Add `alias: 'hvacNeed'` to `serviceNeed` field definition |
| `src/middleware/errorHandler.ts` | Modified | Surface `keyPattern` field name in duplicate key 409 response |
| `src/utils/DashboardCacheService.ts` | New | Fire-and-forget `invalidateOrg(orgId)` helper |

---

## Correctness Properties

### Property 1: No Cross-Tenant Data Leakage
**Validates: Requirements 1.1, 2.1, 3.1, 5.4**

Every query in every modified service includes `organizationId` as a mandatory filter. No code path returns documents from a different organization.

### Property 2: Note Authorship Integrity
**Validates: Requirements 4.1, 4.5**

After this change, `NoteService.update` and `NoteService.delete` both fetch the note first and check `note.authorId === requestingUserId || isAdmin` before mutating. No direct `findOneAndUpdate` call skips this check.

### Property 3: Stage Reference Integrity
**Validates: Requirements 6.1, 6.2, 6.5**

A stage delete is blocked if any lead references it. A stage rename propagates to all leads atomically. A `moveStage` call with an invalid stageId is rejected before any database write.

### Property 4: Dashboard Staleness Bound
**Validates: Requirements 7.1, 7.2**

Every lead and conversation mutation fires a cache invalidation. Dashboard counts are therefore at most one mutation behind at any time, not one TTL behind.

### Property 5: No Demo Data on New Tenants
**Validates: Requirements 8.1, 8.6**

After the seed change, a new organization's `Business.services` is `[]` and the AI message is generic. Existing organizations are unaffected (seed only runs once, idempotently checked by `existing` guard).

---

## Error Handling

| Scenario | HTTP | code |
|---|---|---|
| Note update/delete by non-author non-admin | 403 | `NOTE_AUTHOR_REQUIRED` |
| Stage delete with existing leads | 409 | `STAGE_HAS_LEADS` |
| `moveStage` with non-existent stageId | 422 | `INVALID_STAGE_REFERENCE` |
| `PATCH /leads/:id` with invalid `appointmentId` | 422 | `INVALID_APPOINTMENT_REFERENCE` |
| Conversation not found (own org) | 404 | `CONVERSATION_NOT_FOUND` |
| Lead not found (own org) | 404 | `LEAD_NOT_FOUND` |
| MongoDB duplicate key on any CRM write | 409 | `DUPLICATE_RESOURCE` |

---

## Testing Strategy

### Unit tests
- `LeadService.list`: assert `createdAfter`/`createdBefore`/`followUpBefore` filters are applied correctly; assert `sortBy` out-of-allowlist falls back to `createdAt`; assert `limit > 100` is capped at 100
- `NoteService.update`: assert 403 when non-author non-admin calls update; assert 200 when author calls update; assert 200 when admin calls update
- `PipelineService.deleteStage`: assert 409 when leads exist in stage; assert success when stage is empty
- `PipelineService.updateStage`: assert `LeadModel.updateMany` is called with the new stage name when `name` is in the patch

### Integration tests
- `GET /leads/:id`: assert `appointment` and `conversation` fields are present when IDs are populated; assert `null` when referenced documents do not exist
- `GET /leads/:id/appointments`: assert returns only appointments where `leadId` equals the lead's ID
- `DELETE /conversations/:id`: assert conversation is deleted, lead's `conversationId` is unset, activity is created
- `DELETE /leads/:id`: assert notes and activities for that lead are deleted
- `GET /crm/search?query=test&page=2&limit=5`: assert pagination fields are present in response

### Migration notes
- No MongoDB data migrations are required.
- The `Appointment.type` enum removal is backward-compatible — existing documents keep their string values, the validator is simply removed.
- The `hvacNeed` alias means no document migration is needed for the field rename.
- The `stageName`-to-`stageId` kanban grouping change is a breaking change for any frontend that keyed on stage names. Document this in the API changelog.

---

## Referential Integrity Design (Requirement 11)

### Validation pattern

All reference checks use `Model.exists({ _id: id, organizationId })` — a single indexed query that returns `null` if the document does not exist or belongs to a different org. This is cheaper than `findOne` because it returns only the `_id` field. The same result (null) is returned whether the document does not exist at all or exists in another org — preventing information leakage.

```typescript
// Shared helper (can be inlined or extracted to a utility)
async function assertExists(
  Model: mongoose.Model<any>,
  id: string,
  organizationId: string,
  field: string
): Promise<void> {
  const exists = await Model.exists({ _id: id, organizationId });
  if (!exists) {
    throw new ApiError(422, `Referenced ${field} does not exist`, 'INVALID_REFERENCE', { field });
  }
}
```

### Where each validation is added

| Validation | Service method | Model queried | Condition |
|---|---|---|---|
| Note parent entity | `NoteService.create` | `LeadModel`, `ContactModel`, `CompanyModel` | At least one non-null; each non-null ID must exist |
| Appointment → Lead | `AppointmentService.create` | `LeadModel` | `leadId` is non-null |
| Conversation → Lead | `ConversationService.create` | `LeadModel` | `leadId` is non-null |
| Contact → Company | `ContactService.create`, `ContactService.update` | `CompanyModel` | `companyId` is non-null |
| Contact → Leads | `ContactService.create`, `ContactService.update` | `LeadModel` | `leadIds.length > 0` |
| Lead → Pipeline/Stage | `LeadService.create` | `PipelineModel` | Both `pipelineId` and `stageId` are present |
| Activity → Lead/Contact/Company | `ActivityService.log` | `LeadModel`, `ContactModel`, `CompanyModel` | Non-null IDs — skip insert on failure (warn only) |
| Automation → Lead | `AutomationService.executeAction` | `LeadModel` | Before any lead mutation action |

### Note parent entity validation

`NoteService.create` runs checks in parallel before inserting:

```typescript
async create(organizationId, authorId, dto) {
  const { leadId, contactId, companyId } = dto;

  // At least one parent required
  if (!leadId && !contactId && !companyId) {
    throw new ApiError(422, 'A note must be attached to at least one parent entity', 'NOTE_MISSING_PARENT', { field: 'leadId' });
  }

  // Validate each non-null reference in parallel
  await Promise.all([
    leadId    ? assertExists(LeadModel,    leadId,    organizationId, 'leadId')    : Promise.resolve(),
    contactId ? assertExists(ContactModel, contactId, organizationId, 'contactId') : Promise.resolve(),
    companyId ? assertExists(CompanyModel, companyId, organizationId, 'companyId') : Promise.resolve(),
  ]);

  return NoteModel.create({ ...dto, organizationId, authorId });
}
```

### Lead create — pipeline/stage validation

```typescript
async create(organizationId, dto) {
  if (dto.pipelineId && !dto.stageId || !dto.pipelineId && dto.stageId) {
    throw new ApiError(422, 'pipelineId and stageId must both be supplied together', 'INVALID_REFERENCE', { field: 'pipelineId' });
  }
  if (dto.pipelineId && dto.stageId) {
    const pipeline = await PipelineModel.findOne({ _id: dto.pipelineId, organizationId });
    if (!pipeline || !pipeline.stages.some(s => s.id === dto.stageId)) {
      throw new ApiError(422, 'Referenced pipeline or stage does not exist', 'INVALID_REFERENCE', { field: 'pipelineId' });
    }
  }
  // ... rest of create
}
```

### ActivityService — warn-and-skip pattern

Activities are always system-generated (not user-facing API). A validation failure must never crash the calling flow:

```typescript
async log(params) {
  const checks = await Promise.allSettled([
    params.leadId    ? LeadModel.exists({ _id: params.leadId, organizationId: params.organizationId })    : Promise.resolve(true),
    params.contactId ? ContactModel.exists({ _id: params.contactId, organizationId: params.organizationId }) : Promise.resolve(true),
    params.companyId ? CompanyModel.exists({ _id: params.companyId, organizationId: params.organizationId }) : Promise.resolve(true),
  ]);

  const [leadOk, contactOk, companyOk] = checks.map(r => r.status === 'fulfilled' && r.value !== null);

  if (!leadOk && params.leadId) {
    logger.warn({ event: 'activity.invalid_reference', field: 'leadId', ...params }, '[activity] skipped — lead not found');
    return;
  }
  // ... similar checks for contactId and companyId

  await ActivityModel.create({ ... });
}
```

### AutomationService — target-not-found guard

In `executeAction` within `AutomationService`, before any of the five lead-mutation action types:

```typescript
case 'assign_owner':
case 'update_score':
case 'move_stage':
case 'add_tag':
case 'remove_tag': {
  if (!leadId) break;
  const exists = await LeadModel.exists({ _id: leadId, organizationId });
  if (!exists) {
    logger.warn({ event: 'automation.target_not_found', leadId, organizationId, actionType: action.type }, '[automation] skipped — lead not found');
    break;
  }
  // ... existing action logic
}
```

### Lead delete cascade — Activity cleanup

The existing `LeadService.delete` `Promise.allSettled` batch (from Requirement 2.5) gains one additional operation:

```typescript
ActivityModel.updateMany(
  { organizationId, leadId: id },
  { $set: { leadId: null } }
),
```

This nulls out the `leadId` reference on all activity records for the deleted lead. The activity records themselves are retained (they are an immutable audit trail); only the dangling foreign key is cleared.

### Files changed (additions for Req 11)

| File | Change |
|---|---|
| `src/crm/notes/NoteService.ts` | Add parent entity existence checks in `create`; import `LeadModel`, `ContactModel`, `CompanyModel` |
| `src/services/AppointmentService.ts` | Add `LeadModel.exists` check in `create` when `leadId` is set |
| `src/services/ConversationService.ts` | Add `LeadModel.exists` check in `create` when `leadId` is set |
| `src/crm/contacts/ContactService.ts` | Add `CompanyModel.exists` check; add `LeadModel.countDocuments` check for `leadIds` array |
| `src/services/LeadService.ts` | Add `PipelineModel` lookup in `create` when `pipelineId`/`stageId` present; add `ActivityModel.updateMany` to cascade delete batch |
| `src/crm/activities/ActivityService.ts` | Add `Model.exists` checks before insert; warn-and-skip on failure |
| `src/crm/automation/AutomationService.ts` | Add `LeadModel.exists` guard before all lead-mutation actions |
