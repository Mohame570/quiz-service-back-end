# Frontend Integration Guide

This backend repo does **not** contain the Next.js frontend. Use this guide to connect the separate frontend repository to this API.

## Default URLs

| Service | URL |
|---|---|
| Backend API | `http://localhost:3002/api` (default; set via `PORT` in `.env`) |
| Frontend (expected) | `http://localhost:3001` |
| MailHog (email testing) | `http://localhost:8025` |
| Prisma Studio | `http://localhost:5555` (when running locally) |

## Backend Environment Variables

Set these in the frontend `.env` (names may vary by frontend convention):

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3002/api
```

Backend `.env` must include:

```env
PORT=3002
API_PREFIX=api
FRONTEND_BASE_URL=http://localhost:3001
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/quiz_service?schema=public
JWT_SECRET=your-dev-secret
```

`FRONTEND_BASE_URL` is used by NestJS CORS in `src/main.ts`. The backend only accepts browser requests from that origin when it is set.

## CORS

CORS is enabled when `FRONTEND_BASE_URL` is configured:

```typescript
app.enableCors({
  origin: [frontendBaseUrl],
  credentials: true,
});
```

If the frontend runs on a different port or domain, update `FRONTEND_BASE_URL` in the backend `.env` and restart the API.

## Authentication Flow (current + Sprint 2)

### Sprint 1 (available now)

- `POST /api/auth/register` — create account, returns JWT + user payload
- `POST /api/auth/login` — returns JWT + user payload

Send the access token on protected routes:

```http
Authorization: Bearer <accessToken>
```

JWT payload fields:

- `sub` — user id (use as `studentId` in student/attempt flows once guards are wired)
- `email`
- `role` — `STUDENT` or `ADMIN`

### Sprint 2 (planned)

- `POST /api/auth/verify-email`
- `POST /api/auth/resend-verification`
- Route guards blocking unverified students from quiz solving

Until Sprint 2 lands, student and attempt controllers use a stub student id when no JWT user is present (for local testing only).

## API Modules and Frontend Screens

| Frontend area | Backend prefix | Owner |
|---|---|---|
| Login / Register | `/api/auth` | L1 |
| Admin quiz list & editor | `/api/quizzes` | L2 |
| Question bank | `/api/questions` | L3 |
| **Student dashboard, instructions, solving, and result** | `/api/student` | **L4** |
| Admin analytics | `/api/analytics` | L6 |
| Email / integrity (internal) | notifications + integrity modules | L7 |

> **Frontend rule:** the student UI must use only `/api/auth` and `/api/student`. The `/api/attempts`, `/api/questions`, and `/api/admin/quizzes` endpoints are internal and reserved for the Student module's `StudentAttemptOrchestrator`. Do not call them from the student frontend.

Contract docs live in `docs/api/`.

## Recommended Local Full-Stack Workflow

Terminal 1 — infrastructure + API:

```bash
cd quiz-service-internship-round-1-back-end
cp .env.example .env
docker compose up --build
```

Terminal 2 — frontend (separate repo):

```bash
cd <frontend-repo>
cp .env.example .env   # set NEXT_PUBLIC_API_BASE_URL
npm install
npm run dev
```

Verify connectivity:

1. `curl http://localhost:3002/api/health`
2. Open frontend at `http://localhost:3001`
3. Register/login and confirm requests hit `localhost:3002/api`

## Docker vs Local API Development

| Mode | When to use |
|---|---|
| `docker compose up --build` | Quick full-stack smoke test, demos, onboarding |
| `docker compose up -d postgres mailhog` + `npm run start:dev` | Day-to-day backend development with hot reload |

When using Docker Compose for the API, the database host inside the backend container is `postgres`, not `localhost`. Compose sets `DATABASE_URL` automatically for the `api` service.

## Error Handling Conventions

- `400` — validation failure (class-validator)
- `401` — missing/invalid auth (once guards are active)
- `403` — authenticated but not allowed (e.g. wrong student)
- `404` — resource not found
- `409` — conflict (e.g. duplicate email, already submitted attempt)

Frontend should read Nest's default error shape:

```json
{
  "statusCode": 400,
  "message": ["email must be an email"],
  "error": "Bad Request"
}
```

## Sprint 2 Frontend Checklist

- [ ] Point `NEXT_PUBLIC_API_BASE_URL` at the backend
- [ ] Store JWT from login/register (httpOnly cookie or secure storage per team decision)
- [ ] Send `Authorization` header on student, attempt, and admin routes
- [ ] Handle `emailVerified: false` state after registration
- [ ] Wire quiz solving UI to `/api/student` (start / questions / answers / submit / result)
- [ ] Add tab-switch hook calling integrity endpoint (contract with L5/L7)

For API payload details, always check the matching file in `docs/api/` before implementing a screen.
