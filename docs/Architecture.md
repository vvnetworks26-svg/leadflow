# LeadFlow — Architecture

## Overview

LeadFlow is a monorepo containing two packages:

- **`src/`** — React SPA (Vite), the user-facing frontend
- **`apps/api/`** — Express REST API (Node.js + TypeScript), the backend

The frontend talks to the backend over HTTP using an Axios client (`src/lib/apiClient.ts`). Authentication is handled by the API and tracked in the browser via JWT tokens stored in `localStorage`.

```
Browser
  └── React SPA (Vite, port 3000)
        ├── Pages / Components    (UI only, no business logic)
        ├── Hooks                 (state + side effects)
        ├── Services              (business logic, coordinates repositories)
        ├── Repositories          (persistence adapters — Http or Local)
        └── Context               (AuthContext, ToastContext — React tree globals)
              │
              │  HTTP (Axios, Bearer JWT)
              ▼
        Express API (port 4000)
              ├── Routes → Controllers → Services
              ├── Mongoose Models → MongoDB
              └── Auth: JWT access token (15 min) + refresh token (7 days)
```

---

## Frontend Architecture

### Data Flow — AI Chat → Lead → Appointment

```
User opens ChatWidget (Landing page only)
  │
  ▼
useConversation (hook)
  │  guided steps: name → service → emergency → ZIP → phone → email → preferredDay
  │
  ▼
calendarService.getAvailableSlots()
  │  reads businessSettings for hours + vacation mode
  │  reads existing appointments to exclude booked slots
  │  returns TimeSlot[]
  │
  ▼
SlotPicker rendered in ChatBubble
User picks a slot
  │
  ▼
calendarService.bookAppointment()
  │  creates Appointment via appointmentsApi → HttpAppointmentRepository → POST /appointments
  │
  ├── conversationsApi.create() → POST /conversations
  ├── leadsApi.create()         → POST /leads
  └── notificationService.sendConfirmation() → ToastContext
        │
        ▼
      BookingConfirmationCard shown in chat

Dashboard (Appointments page) fetches from GET /appointments → appears immediately
```

### Repository Pattern

The frontend uses a two-layer repository pattern for each domain:

| Interface | HTTP Implementation | localStorage Fallback |
|-----------|--------------------|-----------------------|
| `ILeadRepository` | `HttpLeadRepository` | `LocalLeadRepository` |
| `IAppointmentRepository` | `HttpAppointmentRepository` | `LocalAppointmentRepository` |
| `IConversationRepository` | `HttpConversationRepository` | `LocalConversationRepository` |
| `IBusinessSettingsRepository` | `HttpBusinessSettingsRepository` | `LocalBusinessSettingsRepository` |
| `INotificationRepository` | `HttpNotificationRepository` | `LocalNotificationRepository` |

API services (`src/services/api/`) instantiate the HTTP repository and fall back to the local cache if the API is unreachable:

```typescript
// leads.ts
export const leadsApi = {
  getAll: async (): Promise<Lead[]> => {
    try {
      return await httpLeadRepository.fetchAll();   // → GET /api/v1/leads
    } catch {
      return httpLeadRepository.findAll();           // in-memory cache
    }
  },
  // ...
};
```

Business settings still use `LocalBusinessSettingsRepository` for Settings page reads/writes (the API's `/business` endpoint is used for reads in the future).

### Calendar Service (`src/services/calendar/calendarService.ts`)

Fully abstracted behind `ICalendarProvider`. The current implementation (`mockProvider`) generates slots from business hours stored in settings and writes bookings via the appointments API.

```typescript
interface ICalendarProvider {
  getAvailableSlots(preferredDay?: string, durationMinutes?: number): Promise<TimeSlot[]>
  bookAppointment(params: BookParams): Promise<BookingConfirmation>
  cancelAppointment(appointmentId: string): Promise<void>
  rescheduleAppointment(appointmentId: string, newSlot: TimeSlot): Promise<BookingConfirmation>
}

// The only line that changes when a real calendar provider is integrated:
export const calendarService: ICalendarProvider = mockProvider;
```

### Service Layer

| Service | Responsibility |
|---------|---------------|
| `services/api/leads.ts` | Lead CRUD — delegates to `HttpLeadRepository` |
| `services/api/appointments.ts` | Appointment CRUD — delegates to `HttpAppointmentRepository` |
| `services/api/conversations.ts` | Conversation CRUD — delegates to `HttpConversationRepository` |
| `services/api/dashboard.ts` | Computed metrics from leads + appointments |
| `services/api/chat.ts` | AI prompt templates and response validation |
| `services/business/businessSettings.ts` | Full business config — delegates to `LocalBusinessSettingsRepository` |
| `services/business/*Service.ts` | Section-level helpers (hours, services, area, AI config, team) |
| `services/calendar/calendarService.ts` | Slot generation + booking via `ICalendarProvider` |
| `services/notifications/notificationService.ts` | Pub/sub for in-app toasts |
| `services/qualification.ts` | Pure lead scoring functions — no I/O |

### Authentication Context (`src/context/AuthContext.tsx`)

`AuthContext` manages the full JWT session lifecycle in the browser:

1. On mount, reads `leadflow_access_token` and `leadflow_refresh_token` from `localStorage`
2. Calls `GET /auth/me` to validate the access token
3. If expired, calls `POST /auth/refresh` with the stored refresh token
4. If refresh also fails, clears all stored credentials
5. On login/register, stores both tokens and the serialised user object
6. On logout, calls `POST /auth/logout` (sends the refresh token to revoke the session server-side), then clears local storage

The `apiClient` Axios instance (`src/lib/apiClient.ts`) attaches the Bearer token on every request and clears it locally on any 401 response.

### State Management

LeadFlow uses local component state and React hooks. No Redux or Zustand.

| What | Where |
|------|-------|
| Auth session | `AuthContext` (tokens in `localStorage`) |
| Toast queue | `ToastContext` (in-memory, subscribed to `notificationService`) |
| Chat conversation | `useConversation` (component state) |
| Leads list | `useLeads` (fetched from API on mount) |
| Appointments list | `useAppointments` (fetched from API on mount) |
| Chat widget visibility | `useChat` (component state) |
| Available time slots | `useCalendar` (fetched on demand) |
| Business settings | `businessSettings` service (localStorage) |

### Routing

HashRouter — compatible with any static host without server-side routing config.

```
/                         Landing page (chat widget active)
/sign-in                  Sign in — redirects to /dashboard if already authenticated
/sign-up                  Register — redirects to /dashboard if already authenticated
/dashboard                Overview (protected)
/dashboard/leads          Lead pipeline
/dashboard/appointments   Dispatch schedule
/dashboard/conversations  Conversation inbox
/dashboard/settings       Business + AI configuration
/dashboard/billing        Billing (placeholder)
```

Route protection lives in `RequireAuth` (in `App.tsx`). While `isLoaded` is false it shows a loading spinner; once loaded it redirects unauthenticated users to `/sign-in`.

---

## API Architecture

### Request Lifecycle

```
Incoming HTTP request
  │
  ├── requestId middleware    — UUID assigned, X-Request-ID header set,
  │                             per-request Pino child logger attached
  ├── helmet                  — security headers
  ├── cors                    — origin allowlist from CORS_ORIGINS env var
  ├── express.json            — body parsing (10 MB limit)
  ├── compression             — gzip responses
  ├── mongoSanitize           — strips $-prefixed keys from body/query/params
  ├── globalLimiter           — 200 req / 15 min per IP
  │
  ├── Router (/api/v1/...)
  │     ├── authenticate      — verifies Bearer JWT, attaches req.user
  │     ├── authorize(...roles)— role check (owner / admin / technician)
  │     ├── validate(Schema)  — Zod body validation, replaces req.body with coerced data
  │     └── Controller        — calls Service, sends JSON response
  │           └── Service     — business logic, talks directly to Mongoose models
  │
  ├── notFoundHandler         — 404 for unmatched routes
  └── errorHandler            — central error handler (ApiError, Mongoose errors, 500)
```

### Layer Responsibilities

| Layer | Files | Responsibility |
|-------|-------|---------------|
| Routes | `src/routes/` | Wire HTTP verbs to middleware chains and controllers |
| Controllers | `src/controllers/` | Parse request, call service, send response — no business logic |
| Services | `src/services/` | All business logic — talk directly to Mongoose models |
| Models | `src/models/` | Mongoose schema definitions |
| DTOs | `src/dto/` | Zod schemas defining the shape of each request body |
| Middleware | `src/middleware/` | Cross-cutting concerns: auth, errors, request tracing |
| Config | `src/config/` | Startup-time config (`env.ts`, `database.ts`, `jwt.ts`, `permissions.ts`) |
| Utils | `src/utils/` | Pure helpers: logging, token sign/verify, validation factory, pagination |

### Authentication and Session Lifecycle

```
Register / Login
  │
  AuthService.register() / .login()
  │  1. Validates credentials (bcryptjs)
  │  2. SessionService.create() — writes Session doc to MongoDB
  │     Session stores: userId, sessionId (UUID), SHA-256(refreshToken),
  │                     userAgent, ipAddress, expiresAt
  │  3. Signs access token  (15 min, HS256, contains sub/email/role/sid/jti)
  │  4. Signs refresh token (7 days,  HS256, contains sub/email/role/sid/jti)
  │  5. SessionService.rotate() — updates stored hash to the real refresh token
  │  6. AuditService.log()  — fire-and-forget audit record to MongoDB
  │
  └── Returns { user, tokens: { accessToken, refreshToken } }

Token Refresh
  │
  AuthService.refresh()
  │  1. verifyRefreshToken() — validates JWT signature + expiry
  │  2. SessionService.verify() — looks up Session by sid
  │     → if hash mismatch: revokes session, throws TOKEN_REUSE (reuse detection)
  │     → if revoked or expired: throws 401
  │  3. Issues new token pair
  │  4. SessionService.rotate() — stores new hash

Logout
  │
  AuthService.logout()
  │  1. verifyRefreshToken() — silent on invalid/expired tokens
  │  2. SessionService.verify() — silent on invalid sessions
  │  3. SessionService.revoke() — sets revokedAt on the Session document
  │  4. AuditService.logLogout() — fire-and-forget
```

**Session storage:** one MongoDB `Session` document per active session. `hashedRefreshToken` is a SHA-256 hex digest of the raw token. The field is excluded from queries by default (`select: false`) and stripped from `toJSON`. Sessions are TTL-indexed — MongoDB auto-deletes expired sessions 24 hours after `expiresAt`.

**Audit log:** every auth event (login, failed login, register, refresh, logout, token reuse, session revoked) is written to an `AuditLog` collection. Writes are fire-and-forget and never block the auth flow.

### Role Model

Three roles are defined in `src/config/permissions.ts`:

| Role | Access |
|------|--------|
| `owner` | Full access — reads, writes, deletes |
| `admin` | Reads + creates/updates — no delete |
| `technician` | Read-only |

### Error Handling

All errors flow through the central `errorHandler` middleware. The `ApiError` class carries a `statusCode` and machine-readable `code` string. The handler also maps Mongoose `ValidationError`, `CastError`, and duplicate key errors to appropriate HTTP responses. Clients never receive stack traces.

### Structured Logging

Every request gets a UUID (`requestId`) and a Pino child logger (`req.logger`). Log entries include `method`, `path`, `status`, `durationMs`, and `requestId` — never `req.url` (which would expose query strings). Sensitive fields (`authorization`, `password`, `passwordHash`, `accessToken`, `refreshToken`, `token`, `cookie`) are redacted to `[Redacted]` at all nesting depths.

---

## Key Design Decisions

**Why HashRouter instead of BrowserRouter?**
Static deployment compatibility. No web server config needed for client-side deep links on S3, Netlify, etc.

**Why is the frontend repository layer dual-mode (Http + Local)?**
The HTTP repositories make real API calls but hold an in-memory cache for instant reads. The local repositories serve as a fallback when the API is unreachable. This means the UI degrades gracefully rather than going blank on a network error.

**Why no global state manager?**
The data graph is shallow — leads, appointments, and conversations are independent lists. React hooks with a `refresh()` pattern handle re-fetching without Redux/Zustand boilerplate.

**Why is the calendar behind an interface from day one?**
Google Calendar, Outlook, and Apple Calendar have different OAuth flows and API shapes. `ICalendarProvider` means integrating a real calendar provider adds a new file and changes one line — no existing code needs modification.

**Why is `businessSettings` still localStorage in the frontend?**
The Settings page reads and writes frequently during configuration. The local-first approach keeps the UI responsive. The API's `/business` endpoint is available for authoritative persistence when needed.

**Why are audit records fire-and-forget?**
An audit write failure must never cause a login or logout to fail. `AuditService.log()` calls `.catch()` and logs the failure via Pino — the auth operation completes regardless.

**Why is `hashedRefreshToken` stored rather than the raw token?**
The Session collection is a sensitive target. Storing a SHA-256 hash means a database read does not expose a usable token. The raw token only ever exists in the JWT payload and in the client's `localStorage`.
