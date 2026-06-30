# LeadFlow — Architecture

## Overview

LeadFlow is a React single-page application. All data currently lives in `localStorage` through a mock API layer. The architecture is intentionally designed so every mock can be replaced with a real implementation by swapping a single file — nothing in the UI or hooks layer needs to change.

```
Browser
  └── React SPA (Vite)
        ├── Pages / Components  (UI only, no business logic)
        ├── Hooks               (state + side effects)
        ├── Services            (business logic, external I/O)
        │     ├── api/          (CRUD — localStorage today, REST tomorrow)
        │     ├── calendar/     (ICalendarProvider — mock today, Google Calendar tomorrow)
        │     ├── notifications/(fire-and-forget — mock today, SMS/email tomorrow)
        │     └── qualification (pure functions, no I/O)
        └── Context             (auth, toasts — React tree globals)
```

---

## Data Flow — AI Chat → Lead → Appointment

```
User opens ChatWidget
  │
  ▼
useConversation (hook)
  │  guided steps: name → service → emergency → ZIP → phone → email → preferredDay
  │
  ▼
calendarService.getAvailableSlots()          ← ICalendarProvider (mock)
  │  returns TimeSlot[]
  │
  ▼
SlotPicker rendered in ChatBubble
User picks a slot
  │
  ▼
calendarService.bookAppointment()            ← writes to localStorage
  │
  ├── conversationsApi.create()              ← localStorage
  ├── leadsApi.create()                      ← localStorage
  └── notificationService.sendConfirmation() ← in-memory pub/sub → ToastContext
        │
        ▼
      BookingConfirmationCard shown in chat

Dashboard (Appointments page) reads from localStorage → appointment appears instantly
```

---

## Service Layer Design

### Calendar Service (`services/calendar/calendarService.ts`)

The calendar layer is fully abstracted behind an `ICalendarProvider` interface.

```typescript
interface ICalendarProvider {
  getAvailableSlots(preferredDay?: string, durationMinutes?: number): Promise<TimeSlot[]>
  bookAppointment(params: BookParams): Promise<BookingConfirmation>
  cancelAppointment(appointmentId: string): Promise<void>
  rescheduleAppointment(appointmentId: string, newSlot: TimeSlot): Promise<BookingConfirmation>
}
```

**To integrate Google Calendar:** implement `ICalendarProvider`, export it as `googleCalendarProvider`, and replace the single assignment:

```typescript
// calendarService.ts — the only line that changes
export const calendarService: ICalendarProvider = googleCalendarProvider;
```

### API Services (`services/api/`)

Each domain has its own file:

| File | Responsibility |
|------|---------------|
| `leads.ts` | CRUD for Lead records |
| `appointments.ts` | CRUD for Appointment records |
| `conversations.ts` | CRUD for Conversation + Message records |
| `dashboard.ts` | Computed metrics from leads + appointments |
| `chat.ts` | Pure AI prompt templates + response validation |

`api.ts` re-exports all of these as the legacy `apiService` object so no existing page imports break.

**To replace with a real REST API:** swap the localStorage reads/writes in each file for `fetch` calls. The hook and component layers are unaffected.

### Notification Service (`services/notifications/notificationService.ts`)

Simple pub/sub. `ToastContext` subscribes and renders toasts. Add Twilio/SendGrid calls inside `notifyCustomer()` and `notifyOwner()` without touching any component.

### Qualification Service (`services/qualification.ts`)

Pure functions — no side effects, no I/O. Takes `ConversationData`, returns `QualificationResult`. Fully unit-testable.

---

## State Management

LeadFlow uses local component state + React hooks. No Redux, no Zustand — not needed at this scale.

| What | Where |
|------|-------|
| Auth session | `AuthContext` (localStorage) |
| Toast queue | `ToastContext` (in-memory, subscribed to notificationService) |
| Chat conversation | `useConversation` (component state, persisted to localStorage on completion) |
| Leads list | `useLeads` (loads from localStorage on mount) |
| Appointments list | `useAppointments` (loads from localStorage on mount) |
| Chat widget visibility | `useChat` (component state) |
| Available slots | `useCalendar` (fetched on demand) |

---

## Routing

HashRouter is used so the app can be deployed to any static host without server-side routing config.

```
/                     Landing page (chat widget active)
/sign-in              Auth
/sign-up              Auth
/dashboard            Overview (protected)
/dashboard/leads      Lead pipeline
/dashboard/appointments  Dispatch schedule
/dashboard/conversations  Inbox
/dashboard/settings   Workspace config
/dashboard/billing    Billing (placeholder)
```

Route protection is handled in `DashboardLayout` — redirects to `/sign-in` if not authenticated.

---

## Key Design Decisions

**Why HashRouter instead of BrowserRouter?**
Static deployment compatibility. No web server config needed for deep links.

**Why localStorage instead of a real database?**
Lets the full product be demonstrated and iterated on without any backend. Every service is behind an interface so the swap is surgical.

**Why no global state manager?**
The data graph is shallow (leads, appointments, conversations are independent lists). `useCallback` + `refresh()` pattern is sufficient and avoids the complexity and boilerplate of Redux/Zustand at this stage.

**Why is the calendar behind an interface from day one?**
Google Calendar, Outlook, and Apple Calendar all have different OAuth flows and API shapes. Abstracting behind `ICalendarProvider` means Sprint 4 adds a new file without modifying existing working code.
