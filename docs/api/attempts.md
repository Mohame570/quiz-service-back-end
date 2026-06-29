# Attempts API Contract

**Owner:** L5  
**Module:** `src/modules/attempts/`  
**Sprint:** 1  
**Consumed by:** L4 (Student solving flow, internal only), L6 (Analytics)

> **Internal use only.** These endpoints are not part of the public frontend API. The student-facing flow now lives under `/api/student` (see `docs/api/student.md`). External callers should not call `/api/attempts` directly.

---

## Data model

### Attempt

| Field | Type | Notes |
|---|---|---|
| `id` | cuid | Primary key |
| `quizId` | cuid | FK → quizzes (L2) |
| `studentId` | cuid | FK → student_profiles.userId (L4) |
| `startedAt` | DateTime | Set when attempt is created |
| `submittedAt` | DateTime \| null | Set on submit; null while in-progress |
| `status` | `AttemptStatus` | See enum below |
| `score` | Int \| null | Populated by scoring service (Sprint 2) |
| `maxScore` | Int \| null | Populated by scoring service (Sprint 2) |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | Auto-updated |

### AttemptAnswer

| Field | Type | Notes |
|---|---|---|
| `id` | cuid | Primary key |
| `attemptId` | cuid | FK → attempts (cascade delete) |
| `questionId` | cuid | FK → questions (L3) |
| `selectedOptionId` | string \| null | null = skipped |
| `isCorrect` | Boolean \| null | Populated by scoring service (Sprint 2) |
| `answeredAt` | DateTime | Updated on every upsert |

### AttemptStatus enum

```
IN_PROGRESS  — attempt started, not yet submitted
SUBMITTED    — student submitted manually
TIMED_OUT    — server-side or auto-submit on timer end (Sprint 2/L4)
ABANDONED    — never submitted, session expired
```

---

## Endpoints

### POST /api/attempts
Start a new quiz attempt.

**Auth:** Student (JWT — wire in from L1)  
**Request body:**
```json
{ "quizId": "cuid" }
```
**Response 201:**
```json
{
  "id": "cuid",
  "quizId": "cuid",
  "studentId": "cuid",
  "startedAt": "2026-06-01T10:00:00.000Z",
  "submittedAt": null,
  "status": "IN_PROGRESS",
  "score": null,
  "maxScore": null,
  "createdAt": "2026-06-01T10:00:00.000Z",
  "updatedAt": "2026-06-01T10:00:00.000Z",
  "answers": []
}
```
**Errors:** `400` invalid body or validation failure

---

### GET /api/attempts
List all attempts for the authenticated student.

**Auth:** Student (JWT)  
**Query params:** `?quizId=cuid` (optional filter)  
**Response 200:** array of `AttemptSummary` (no `answers` field)

---

### GET /api/attempts/:id
Get a single attempt with all saved answers.

**Auth:** Student (JWT — must own the attempt)  
**Response 200:** full `Attempt` with `answers` array  
**Errors:** `404` not found, `403` forbidden

---

### PATCH /api/attempts/:id/answers
Incrementally save or update answers for an in-progress attempt.  
Upserts by `(attemptId, questionId)` — safe to call multiple times.

**Auth:** Student (JWT — must own the attempt)  
**Request body:**
```json
{
  "answers": [
    { "questionId": "cuid", "selectedOptionId": "option-value" },
    { "questionId": "cuid", "selectedOptionId": null }
  ]
}
```
`selectedOptionId: null` means the question was skipped.

**Response 200:** array of saved `AttemptAnswer` objects  
**Errors:** `404` not found, `403` forbidden, `409` attempt not in-progress

---

### POST /api/attempts/:id/submit
Finalise the attempt. Sets `status → SUBMITTED` and records `submittedAt`.  
Optionally bulk-saves remaining answers included in the payload.  
Scoring (`score`, `isCorrect`) is handled by the scoring service in Sprint 2.

**Auth:** Student (JWT — must own the attempt)  
**Request body:**
```json
{
  "answers": []
}
```
**Response 200:** full `Attempt` with updated status, `submittedAt`, and persisted `answers`  
**Errors:** `404` not found, `403` forbidden, `409` already submitted

---

### GET /api/attempts/:id/result
Read the graded result of a submitted attempt.  
`score` and `isCorrect` will be null until Sprint 2 scoring runs.

**Auth:** Student (JWT — must own the attempt)  
**Response 200:** full `Attempt`  
**Errors:** `404` not found, `403` forbidden, `409` not yet submitted

---

## Dependencies on other modules

| Dependency | Owner | Sprint needed | Notes |
|---|---|---|---|
| `User` model + JWT `sub` claim | L1 | Sprint 1–2 | `studentId` comes from JWT |
| `Quiz` model | L2 | Sprint 1–2 | `quizId` validated at app level |
| `Question` / `Option` models | L3 | Sprint 2 | Needed for scoring in Sprint 2 |
| Auth JWT guard | L1 | Sprint 2 | Stubbed with `req.user?.sub` for now |

## Consumed by

| Consumer | What they use |
|---|---|
| L4 Student solving flow | `POST /attempts`, `PATCH /attempts/:id/answers`, `POST /attempts/:id/submit` |
| L6 Analytics | `AttemptSummaryDto` shape, `GET /attempts` list, `status`, `score`, `submittedAt` |

---

## Open questions

- Should `TIMED_OUT` be set by L4 (client auto-submit) or by a server-side job? Needs agreement with L4.
- Should the scoring service (Sprint 2) be a method on `AttemptsService` or a separate `ScoringService`? Suggest separate for clarity.
