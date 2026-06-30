# LeadFlow — Coding Standards

Consistency rules for everyone working on this codebase. Keep it pragmatic — these exist to reduce friction, not to be pedantic.

---

## Language & Tooling

- **TypeScript everywhere.** No `any` unless unavoidable; prefer `unknown` + type narrowing.
- **Strict mode.** `tsconfig.json` has `"strict": true`. Don't weaken it.
- **ESM modules.** `"type": "module"` in `package.json`. Use `import/export`, never `require`.
- **Lint before PR.** `npm run lint` (tsc --noEmit) must pass with zero errors.

---

## File & Folder Naming

| Thing | Convention | Example |
|-------|-----------|---------|
| React components | PascalCase file + named export | `LeadCard.tsx` → `export function LeadCard` |
| Hooks | camelCase, `use` prefix | `useConversation.ts` |
| Services | camelCase, descriptive | `calendarService.ts` |
| Types/interfaces | PascalCase | `BookingConfirmation`, `TimeSlot` |
| Type aliases | PascalCase | `ConversationStep`, `LeadStatus` |
| Constants | SCREAMING_SNAKE for module-level primitives | `DEFAULT_SLOT_DURATION` |

---

## Component Rules

**One component per file.** Small helper components (e.g., a `Row` function inside `BookingConfirmationCard`) are the only exception — keep them at the bottom of the same file.

**Named exports only.** No default exports for components.

```tsx
// ✅ good
export function LeadCard({ lead, onClick }: Props) { ... }

// ❌ avoid
export default function LeadCard(...) { ... }
```

Exception: page components use default exports because React Router lazy loading expects them.

**Props interface above the component.** Always explicit, never inline objects.

```tsx
interface Props {
  lead: Lead;
  onClick: (lead: Lead) => void;
}

export function LeadCard({ lead, onClick }: Props) { ... }
```

**Keep components thin.** No business logic inside JSX. If you're writing an `if` statement that touches data, it belongs in a hook or service.

---

## Hooks

- One hook per concern.
- Expose a `refresh` function when the hook manages a list — don't force parent re-renders.
- All async side effects live inside `useCallback` with explicit dependency arrays.
- Never call a service directly from JSX — always go through a hook.

```typescript
// ✅ good — hook owns the async logic
const { leads, refresh } = useLeads();

// ❌ avoid — component calling API directly
const leads = await leadsApi.getAll(); // inside a component
```

---

## Services

**Pure functions where possible.** `qualification.ts` is the model — takes inputs, returns outputs, zero side effects, trivially testable.

**Interfaces before implementations.** Define `ICalendarProvider` before writing `mockCalendarProvider`. This enforces the contract and makes future adapter development mechanical.

**No UI imports in services.** Services must not import React, components, or hooks. The dependency arrow points one way: components → hooks → services.

**Async/await over raw Promises.** Easier to read, easier to debug.

---

## TypeScript

**No casting with `as` to silence errors.** Fix the type, or use a type guard.

```typescript
// ✅ good
if (isLead(value)) { ... }

// ❌ avoid
const lead = value as Lead;
```

**Prefer `interface` for objects, `type` for unions and aliases.**

```typescript
interface Lead { ... }               // object shape
type LeadStatus = 'New' | 'Qualified'; // union
type ConversationStep = ...          // alias
```

**Mark optional fields explicitly.**

```typescript
interface Appointment {
  assignedTechnician?: string; // nullable field
  confirmationNumber?: string;
}
```

---

## Styling

This project uses Tailwind CSS v4. Follow the existing patterns.

**Class ordering:** layout → spacing → sizing → typography → colour → border → shadow → state variants.

**No inline `style` props** unless you need a dynamic value that Tailwind can't express (e.g. `style={{ width: \`${pct}%\` }}`).

**Reuse the design tokens:**

| Token | Value | Usage |
|-------|-------|-------|
| Primary | `indigo-600` | Buttons, active states, accents |
| Page bg | `slate-50` | Body background |
| Card bg | `white` | All cards and panels |
| Heading | `slate-900` | `font-display font-extrabold` |
| Muted text | `slate-500` | Subtitles, labels |
| Success | `emerald-*` | Positive states |
| Warning | `amber-*` | Caution states |
| Danger | `red-*` | Errors, destructive actions |

**Design system classes used consistently across the codebase:**

```
Card:          bg-white border border-slate-200 rounded-xl p-6 shadow-sm
Primary btn:   bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4.5 py-2.5 rounded-lg shadow-md shadow-indigo-100
Input:         px-3.5 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-xs bg-slate-50/50
Status badge:  inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border
Section title: font-display font-extrabold text-2xl text-slate-900 tracking-tight
```

---

## Git

- Branch from `main`: `feature/short-description`, `fix/short-description`
- Commit messages: imperative present tense — `Add slot picker component`, `Fix booking persistence`
- One logical change per commit
- `npm run lint` must pass before pushing
- PR titles under 70 characters; use the description for context

---

## What to Avoid

- **`console.log` left in production code.** Use `console.error` for caught errors in services; remove debug logs before merging.
- **Hardcoded strings in components.** HVAC service names, technician names, and ZIP lists live in services or constants files.
- **Prop drilling more than two levels deep.** Lift state to a hook or context instead.
- **Mixing concerns.** A component that fetches data, transforms it, and renders it is three things. Split it.
- **Breaking the mock API contract.** The `apiService` facade in `services/api.ts` must remain backward-compatible at all times.
