# LeadFlow

AI-powered lead capture and appointment booking SaaS built for HVAC companies with 5–50 employees.

A visitor on your website opens the chat widget, answers a few questions, picks a time slot, and books an appointment — all without leaving the page. The lead and appointment appear instantly in the dashboard.

---

## Features

| Sprint | What was built |
|--------|----------------|
| 1 | Marketing landing page, authentication (mock Clerk), dashboard shell, routing |
| 2 | AI chat widget, guided conversation engine, lead qualification, lead management, conversation timeline |
| 3 | Appointment booking engine, scheduling service, calendar abstraction layer, appointment details, toast notifications |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 |
| Language | TypeScript 5.8 |
| Build tool | Vite 6 |
| Styling | Tailwind CSS v4 |
| Routing | React Router v7 (HashRouter) |
| Animation | Motion (Framer Motion) v12 |
| Icons | Lucide React |
| Persistence | localStorage (mock — no backend yet) |
| AI (future) | OpenAI / Google Gemini via `@google/genai` |

---

## Folder Structure

```
leadflow/
├── public/
├── src/
│   ├── components/
│   │   ├── Appointments/     # AppointmentDetails, AppointmentTimeline
│   │   ├── Chat/             # ChatWidget, ChatWindow, ChatBubble, SlotPicker,
│   │   │                     # BookingConfirmationCard, ChatInput, TypingIndicator
│   │   ├── Conversation/     # ConversationTimeline
│   │   └── Lead/             # LeadCard, LeadDetails
│   ├── context/
│   │   ├── AuthContext.tsx   # Mock Clerk-style auth (localStorage)
│   │   └── ToastContext.tsx  # In-app toast notifications
│   ├── hooks/
│   │   ├── useAppointments.ts
│   │   ├── useBooking.ts
│   │   ├── useCalendar.ts
│   │   ├── useChat.ts
│   │   ├── useConversation.ts
│   │   └── useLead.ts
│   ├── layouts/
│   │   └── DashboardLayout.tsx
│   ├── pages/
│   │   ├── auth/             # SignIn, SignUp
│   │   ├── dashboard/        # Overview, Leads, Appointments, Conversations,
│   │   │                     # Settings, Billing
│   │   └── Landing.tsx
│   ├── services/
│   │   ├── api/              # leads.ts, appointments.ts, conversations.ts,
│   │   │                     # dashboard.ts, chat.ts
│   │   ├── calendar/         # calendarService.ts (ICalendarProvider abstraction)
│   │   ├── notifications/    # notificationService.ts
│   │   ├── api.ts            # Backwards-compatible facade
│   │   └── qualification.ts  # Lead scoring rules
│   └── types/
│       └── index.ts          # All shared TypeScript interfaces and types
├── docs/
│   ├── Architecture.md
│   └── CodingStandards.md
├── .env.example
├── .gitignore
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## Local Setup

**Prerequisites:** Node.js 20+

```bash
# 1. Clone the repo
git clone https://github.com/your-org/leadflow.git
cd leadflow

# 2. Install dependencies
npm install

# 3. Copy environment variables
cp .env.example .env
# Edit .env and fill in any values you need

# 4. Start the dev server
npm run dev
# App is available at http://localhost:3000
```

**Other scripts:**

```bash
npm run build     # Production build → dist/
npm run preview   # Serve the production build locally
npm run lint      # TypeScript type-check (tsc --noEmit)
npm run clean     # Remove dist/ and server.js
```

---

## Deployment

The app is a fully static single-page application after `npm run build`. Deploy the `dist/` folder to any static host:

- **Vercel** — connect the repo, set build command to `npm run build`, output dir to `dist`
- **Netlify** — same as Vercel; add `_redirects` file with `/* /index.html 200` for client-side routing
- **AWS S3 + CloudFront** — upload `dist/` to S3, enable static hosting, configure CloudFront

When a real backend is added (Express + MongoDB), deploy the API server separately and point `VITE_API_URL` at it.

---

## Roadmap

### Sprint 4 — Google Calendar Integration
- Replace `calendarService` mock with real Google Calendar API
- OAuth 2.0 flow using `VITE_GOOGLE_CLIENT_ID`
- Two-way sync: bookings appear in the technician's Google Calendar

### Sprint 5 — Real Backend
- Express API server with MongoDB (`MONGODB_URI`)
- JWT authentication (`JWT_SECRET`)
- Replace all localStorage mock services with real API calls

### Sprint 6 — OpenAI Integration
- Replace mock conversation engine with GPT-4o via `VITE_OPENAI_API_KEY`
- Function calling for structured lead data extraction
- Streaming responses in the chat widget

### Sprint 7 — Notifications
- SMS via Twilio (customer confirmations)
- Email via SendGrid (owner alerts, daily digest)
- Push notifications via web push API

### Sprint 8 — CRM Integrations
- ServiceTitan webhook sync
- HubSpot contact creation
- Zapier webhook trigger on lead qualification

---

## Contributing

1. Branch from `main` using `feature/your-feature-name`
2. Follow the patterns in `docs/CodingStandards.md`
3. Run `npm run lint` before opening a PR
4. Keep PRs focused — one feature or fix per PR
