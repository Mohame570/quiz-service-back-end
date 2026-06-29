# PitIQ Sprint 4 — Demo Script

**Owner:** L7 (Mohamed Waleed)  
**Date:** 2026-06-29  
**Duration:** ~8 minutes  
**Audience:** Mentor review / handover demo

---

## Demo Flow Overview

```
┌──────────┐    ┌──────────┐    ┌───────────┐    ┌──────────┐
│ 1. Setup │───▶│ 2. Email │───▶│ 3. Solve  │───▶│ 4. Flag  │
│  Populate│    │ Delivery │    │  & Cheat  │    │ & Review │
└──────────┘    └──────────┘    └───────────┘    └──────────┘
                                                   │
                                              ┌────▼─────┐
                                              │ 5. Wrap  │
                                              │  & Docs  │
                                              └──────────┘
```

---

## Prerequisites

1. Backend running: `cd quiz-service-internship-round-1-back-end && docker compose up -d`
2. Frontend running: `cd quiz-service-internship-round-1-front-end && npm run dev`
3. Populate demo data: `./scripts/populate-demo-data.sh`
4. Open browser to `http://localhost:3000/login`
5. Login as admin: `admin@live-test.example` / `Password123!`

---

## Step 1: Setup & Verify Backend (1 min)

**What to show:**
- Docker containers healthy: `docker compose ps`
- Backend health endpoint: `curl http://localhost:3002/api/health`
- Swagger/API docs if configured

**Talking points:**
> "The backend is running in Docker with PostgreSQL, the NestJS API, and MailHog for email capture. All migrations are applied and the health endpoint returns OK."

---

## Step 2: Email Delivery Dashboard (2 min)

**Navigate:** Admin Sidebar → **Notifications** (or `/admin/dashboard/notifications`)

**What to show:**

1. **4-card stats grid** — Total Emails, Delivered, Failed, Pending
   > "The delivery summary aggregates all email delivery logs across verification and invitation emails. We can see at a glance how many emails went out, how many failed, and how many are still pending."

2. **Invitation Status by Quiz table** — per-quiz breakdown with delivery progress bar
   > "For each quiz, we show how many students were invited, how many invitation emails were sent, failed, or pending. The inline progress bar gives a quick visual of delivery health."

3. **Empty state** (if no invitation data)
   > "When no invitations have been sent yet, we show a friendly empty state rather than a broken table."

**Edge states demonstrated:**
- Loading spinner on initial fetch
- Error state with retry button (stop backend briefly to show)
- Graceful empty state

---

## Step 3: Student Solves Quiz & Triggers Cheating Events (2 min)

**What happens behind the scenes:**
> "When a student takes a quiz, the solving page uses the integrity hook to track tab switches, window blur events, fullscreen exits, and copy attempts. Each event is POSTed to `/api/integrity/events` and linked to the active attempt."

**Demo data shows:**
- 4 attempts with varying cheating event counts (1, 4, 7, 14 events)
- Multiple event types: TAB_HIDDEN, WINDOW_BLUR, FULLSCREEN_EXIT, COPY_PASTE, WINDOW_FOCUS

> "In production, the frontend solving page's tab-switch hook would capture these events automatically. For this demo, we've pre-populated realistic event patterns."

---

## Step 4: Suspicious Attempts Integrity View (2 min)

**Navigate:** Admin Sidebar → **Integrity** (or `/admin/dashboard/integrity`)

**What to show:**

1. **Threshold configurator** — slider from 1 to 20, default 3
   > "Admins can tune the sensitivity of the flagging system. The threshold determines how many cheating events must occur before an attempt is flagged. The URL updates so the view is shareable and bookmarkable."

2. **Flagged Attempts table** — student name, quiz, event count badge, latest event time
   > "At threshold 3, we see 3 flagged attempts. The severity badges use color coding: yellow for 3-4 events, amber for 5-9, and red for 10+ events."

3. **Expandable event timeline** — click a row to expand
   > "Clicking any row expands a detailed timeline of every cheating event for that attempt, with typed badges showing the event category, a description, and the exact timestamp."

4. **Adjust threshold live** — move slider to 5, then 10
   > "As we raise the threshold to 5, the low-severity attempt disappears. At 10, only the most egregious case remains. This lets admins tune their investigation based on how strict they want to be."

**Edge states demonstrated:**
- Loading spinner with animated border
- Error state with retry button
- Empty state: "No suspicious attempts found at threshold X. Everything looks clean!"
- Data state with full table and expandable rows

---

## Step 5: Wrap-Up & Documentation (1 min)

**What to show:**

1. **API Documentation** — `docs/api/notifications.md` and `docs/api/integrity.md`
   > "All endpoints are documented with request/response shapes, auth requirements, validation rules, and dependencies."

2. **Postman Collection** — `docs/api/postman-collection.json`
   > "The Postman collection contains all main endpoints with example requests, auth token setup, and test assertions. Import it into Postman to run the full API surface."

3. **Integration Test** — `test/live/e2e-full-flow.live-spec.ts`
   > "The end-to-end live test covers the complete flow: register → verify email → login → solve quiz → submit → score → analytics → integrity → delivery summary. Run with LIVE_TESTS=1."

---

## Key Talking Points

| Topic | Message |
|-------|---------|
| **Design consistency** | All admin views follow the PitIQ DESIGN.md system — navy/sky-blue palette, Geist typography, soft shadows, 4px spacing grid |
| **Surgical changes** | No modifications to quiz CRUD, question bank, student solving, scoring, or auth modules |
| **Client-side fetching** | Data fetching runs client-side so browser auth tokens are sent; server components only pass initial config |
| | |
| **Test coverage** | 12 new e2e specs for integrity-admin + notifications-admin; 27/27 live tests pass |
| **Ready for handover** | API docs, Postman collection, demo script, and test reports are complete enough for an independent engineer to take over |

---

## Troubleshooting During Demo

| Problem | Quick Fix |
|---------|-----------|
| Backend unreachable | `docker compose up -d` |
| No suspicious attempts | Run `./scripts/populate-demo-data.sh` |
| 401 on admin pages | Login again as `admin@live-test.example` |
| Frontend won't start | `npm install && npm run dev` |
| Port conflict | `npx next dev -p 3001` |
