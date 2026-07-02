# LeadFlow

AI-powered lead capture and appointment booking SaaS built for HVAC companies with 5–50 employees.

A visitor on your website opens the chat widget, answers a few questions, picks a time slot, and books an appointment — all without leaving the page. The lead and appointment appear instantly in the dashboard.

---

## What's Built

| Area | Status |
|------|--------|
| Marketing landing page | ✅ |
| AI chat widget with guided conversation engine | ✅ |
| Lead qualification and lead management | ✅ |
| Conversation timeline and inbox | ✅ |
| Appointment booking engine with slot picker | ✅ |
| Calendar abstraction layer (`ICalendarProvider`) | ✅ |
| Dashboard (Overview, Leads, Appointments, Conversations, Settings, Billing) | ✅ |
| Business settings (profile, hours, services, service area, AI config, team) | ✅ |
| Toast notification system | ✅ |
| Express REST API (auth, leads, appointments, conversations, business, notifications) | ✅ |
| JWT authentication with session management | ✅ |
| MongoDB persistence via Mongoose | ✅ |
| HTTP repository layer (frontend → API) | ✅ |

---

## Tech Stack

### Frontend

| Layer | Technology |
|-------|-----------|
| Framework | React 19 |
| Language | TypeScript 5.8 |
| Build tool | Vite 6 |
| Styling | Tailwind CSS v4 |
| Routing | React Router v7 (HashRouter) |
| Animation | Motion (Framer Motion) v12 |
| Icons | Lucide React |
| HTTP client | Axios |
| AI (mock) | `@google/genai` (wired, not yet calling a live model) |

### API (`apps/api`)

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+ |
| Framework | Express 4 |
| Language | TypeScript 5.8 |
| Database | MongoDB via Mongoose 8 |
| Auth | JWT (jsonwebtoken) — access + refresh tokens |
| Password hashing | bcryptjs |
| Validation | Zod |
| Logging | Pino + pino-pretty |
| Security | Helmet, express-rate-limit, express-mongo-sanitize, CORS |

---

## Monorepo Structure

```
leadflow/
├── apps/
│   └── api/                      # Express API server
│       ├── src/
│       │   ├── app.ts            # Express app factory
│       │   ├── server.ts         # Entry point — connects DB, binds port
│       │   ├── config/
│       │   │   ├── database.ts   # Mongoose connect/disconnect
│       │   │   ├── env.ts        # Validated environment config
│       │   │   ├── jwt.ts        # JWT config constants
│       │   │   └── permissions.ts# Role constants (ALL_ROLES, OWNER_ADMIN, OWNER_ONLY)
│       │   ├── controllers/      # Thin request/response handlers
│       │   ├── dto/              # Zod schemas + inferred types
│       │   ├── middleware/
│       │   │   ├── authenticate.ts  # Bearer token verification + authorize()
│       │   │   ├── errorHandler.ts  # Central error handler + ApiError class
│       │   │   └── requestId.ts     # UUID per request, Pino child logger
│       │   ├── models/           # Mongoose schemas (Lead, Appointment,
│       │   │                     # Conversation, Business, Notification,
│       │   │                     # User, Session, AuditLog)
│       │   ├── routes/           # Express routers (one per domain)
│       │   ├── services/         # Business logic (AuthService, SessionService,
│       │   │                     # AuditService, LeadService, AppointmentService,
│       │   │                     # ConversationService, BusinessService,
│       │   │                     # NotificationService)
│       │   ├── types/
│       │   │   └── index.ts      # Shared domain types (mirrors frontend types)
│       │   └── utils/
│       │       ├── logger.ts     # Pino singleton with field redaction
│       │       ├── params.ts     # Route param helper
│       │       ├── query.ts      # Pagination helpers
│       │       ├── tokens.ts     # JWT sign/verify utilities
│       │       └── validate.ts   # Zod middleware factory
│       ├── .env.example
│       └── package.json
│
├── src/                          # React frontend
│   ├── App.tsx                   # Router + providers
│   ├── main.tsx
│   ├── index.css
│   ├── components/
│   │   ├── Appointments/         # AppointmentDetails, AppointmentTimeline
│   │   ├── Chat/                 # ChatWidget, ChatWindow, ChatBubble, SlotPicker,
│   │   │                         # BookingConfirmationCard, ChatInput, TypingIndicator
│   │   ├── Conversation/         # ConversationTimeline
│   │   ├── Lead/                 # LeadCard, LeadDetails
│   │   └── Settings/             # AIReceptionistTab, BusinessHoursTab,
│   │                             # BusinessProfileTab, BusinessServicesTab,
│   │                             # ServiceAreaTab
│   ├── context/
│   │   ├── AuthContext.tsx       # JWT auth wired to Express API
│   │   └── ToastContext.tsx      # In-app toast notifications
│   ├── hooks/
│   │   ├── useAppointments.ts
│   │   ├── useBooking.ts
│   │   ├── useCalendar.ts
│   │   ├── useChat.ts
│   │   ├── useConversation.ts
│   │   └── useLead.ts
│   ├── layouts/
│   │   └── DashboardLayout.tsx
│   ├── lib/
│   │   ├── apiClient.ts          # Axios instance — attaches Bearer token, handles 401
│   │   └── authErrors.ts         # Maps API error codes to user-friendly messages
│   ├── pages/
│   │   ├── auth/                 # SignIn, SignUp
│   │   ├── dashboard/            # Overview, Leads, Appointments, Conversations,
│   │   │                         # Settings, Billing
│   │   └── Landing.tsx
│   ├── repositories/
│   │   ├── I*Repository.ts       # Interfaces (Lead, Appointment, Conversation,
│   │   │                         # BusinessSettings, Notification)
│   │   ├── Http*Repository.ts    # HTTP implementations (calls Express API)
│   │   └── Local*Repository.ts   # localStorage fallback implementations
│   ├── services/
│   │   ├── api/                  # leads.ts, appointments.ts, conversations.ts,
│   │   │                         # dashboard.ts, chat.ts
│   │   ├── business/             # businessSettings.ts, businessProfileService.ts,
│   │   │                         # businessHoursService.ts, businessServicesService.ts,
│   │   │                         # serviceAreaService.ts, aiConfigService.ts
│   │   ├── calendar/             # calendarService.ts (ICalendarProvider abstraction)
│   │   ├── notifications/        # notificationService.ts
│   │   ├── api.ts                # Backwards-compatible re-export facade
│   │   └── qualification.ts      # Pure lead scoring functions
│   └── types/
│       └── index.ts              # All shared TypeScript interfaces and types
│
├── docs/
│   ├── Architecture.md
│   └── CodingStandards.md
├── .env.example                  # Frontend env vars
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## Local Setup

### Prerequisites

- Node.js 20+
- MongoDB (local or Atlas cluster)

### Frontend

```bash
# 1. Clone the repo
git clone https://github.com/your-org/leadflow.git
cd leadflow

# 2. Install dependencies
npm install

# 3. Copy environment variables
cp .env.example .env
# Set VITE_API_URL=http://localhost:4000

# 4. Start the dev server
npm run dev
# App available at http://localhost:3000
```

### API

```bash
cd apps/api

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Fill in MONGODB_URI, JWT_SECRET, JWT_REFRESH_SECRET

# Start the dev server (with file watching)
npm run dev
# API available at http://localhost:4000
```

### Frontend scripts

```bash
npm run dev       # Dev server on port 3000
npm run build     # Production build → dist/
npm run preview   # Serve the production build locally
npm run lint      # TypeScript type-check (tsc --noEmit)
npm run clean     # Remove dist/ and server.js
```

### API scripts

```bash
npm run dev       # tsx watch — restarts on file change
npm run build     # tsc → dist/
npm run start     # node dist/server.js (production)
npm run lint      # tsc --noEmit
```

---

## Environment Variables

### Frontend (`.env` at repo root)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Yes | Base URL of the Express API — e.g. `http://localhost:4000` |

### API (`apps/api/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | `development`, `test`, or `production` |
| `PORT` | No | `4000` | Port the API server listens on |
| `API_VERSION` | No | `1.0.0` | Reported in the health endpoint |
| `MONGODB_URI` | Prod only | — | MongoDB connection string |
| `JWT_SECRET` | Prod only | dev default | Access token signing secret (min 32 chars) |
| `JWT_REFRESH_SECRET` | Prod only | dev default | Refresh token signing secret (min 32 chars) |
| `JWT_EXPIRES_IN` | No | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | No | `7d` | Refresh token lifetime |
| `CORS_ORIGINS` | No | `http://localhost:3000` | Comma-separated list of allowed origins |
| `LOG_LEVEL` | No | `info` | Pino log level (`trace`, `debug`, `info`, `warn`, `error`) |

In `development` and `test`, `MONGODB_URI`, `JWT_SECRET`, and `JWT_REFRESH_SECRET` fall back to safe defaults so the server starts without a full `.env` file.

---

## Deployment

### Frontend

`npm run build` produces a fully static SPA in `dist/`. Deploy to any static host:

- **Vercel** — connect the repo, build command `npm run build`, output dir `dist`
- **Netlify** — same; add `_redirects` file with `/* /index.html 200` for client-side routing
- **AWS S3 + CloudFront** — upload `dist/`, enable static hosting, configure CloudFront distribution

Set `VITE_API_URL` to the deployed API URL before building.

### API

The API is a standard Node.js/Express server. Deploy to any Node-compatible host:

- **Railway / Render / Fly.io** — connect the `apps/api` directory, set `npm run start` as the start command
- **AWS EC2 / ECS** — build with `npm run build`, run `npm start`
- Set all production environment variables in the host's secrets manager

---

## API Overview

All endpoints are prefixed `/api/v1`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | — | Server + DB health check |
| POST | `/auth/register` | — | Create account, returns JWT pair |
| POST | `/auth/login` | — | Login, returns JWT pair |
| POST | `/auth/logout` | — | Revoke current session |
| POST | `/auth/refresh` | — | Rotate access + refresh tokens |
| GET | `/auth/me` | Bearer | Current user |
| GET/POST | `/leads` | Bearer | List / create leads |
| GET/PATCH/DELETE | `/leads/:id` | Bearer | Get / update / delete lead |
| GET/POST | `/appointments` | Bearer | List / create appointments |
| GET/PATCH | `/appointments/:id` | Bearer | Get / update appointment |
| POST | `/appointments/:id/cancel` | Bearer | Cancel appointment |
| GET/POST | `/conversations` | Bearer | List / create conversations |
| GET/PATCH | `/conversations/:id` | Bearer | Get / update conversation |
| POST | `/conversations/:id/messages` | Bearer | Add message to conversation |
| GET/PUT/PATCH | `/business` | Bearer | Get / upsert business settings |
| GET/POST | `/notifications` | Bearer | List / create notifications |
| PATCH | `/notifications/read-all` | Bearer | Mark all read |
| PATCH | `/notifications/:id/read` | Bearer | Mark one read |
| DELETE | `/notifications/:id` | Bearer | Delete notification |

Role requirements: reads are open to all three roles (`owner`, `admin`, `technician`); writes require `owner` or `admin`; deletes require `owner`.

---

## Contributing

1. Branch from `main` using `feature/your-feature-name`
2. Follow the patterns in `docs/CodingStandards.md`
3. Run `npm run lint` in both the root and `apps/api` before opening a PR
4. Keep PRs focused — one feature or fix per PR
