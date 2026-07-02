# Student API Contract

**Owner:** L4  
**Module:** `src/modules/student/`  
**Sprint:** 2

> **Public API surface.** The frontend must call only `/api/auth` and `/api/student`. The `/api/attempts`, `/api/questions`, and `/api/admin/quizzes` endpoints are reserved for internal use and for the Student service's `StudentAttemptOrchestrator`.

## Endpoints

All endpoints require:
- `Authorization: Bearer <JWT>` (`JwtAuthGuard`)
- `emailVerified === true` (`EmailVerifiedGuard`)
- `user.role === STUDENT` (`StudentRoleGuard`)

### GET /api/student/quizzes

List PUBLISHED quizzes that the current student can take (assigned + in window).

**Response 200**

```json
{
  "items": [
    {
      "id": "cm1quiz00000000000000abc",
      "title": "Sample Quiz",
      "description": null,
      "durationMinutes": 30,
      "passingScore": 70,
      "startsAt": null,
      "endsAt": null,
      "questionCount": 5,
      "attemptStatus": "NOT_STARTED",
      "attemptId": null
    }
  ]
}
```

### GET /api/student/quizzes/:quizId

Quiz instructions / pre-start screen.

**Response 200**

```json
{
  "id": "cm1quiz00000000000000abc",
  "title": "Sample Quiz",
  "description": null,
  "durationMinutes": 30,
  "passingScore": 70,
  "startsAt": null,
  "endsAt": null,
  "questionCount": 5,
  "attemptStatus": "NOT_STARTED",
  "attemptId": null,
  "canStart": true,
  "reasonIfBlocked": null
}
```

**Errors:** `404 Quiz not found or not available.`

### POST /api/student/quizzes/:quizId/accept-invitation

Accept a quiz invitation link and add the logged-in student to the quiz roster if they are not already assigned. This is the backend step that must run when a student opens an invitation URL (e.g. from email).

**When to call:** After login and email verification, before `GET /student/quizzes/:quizId` or start — especially when the student arrived via an invitation link and is not yet on the quiz list.

**Request body:** none

**Response 201**

```json
{
  "quizId": "cm1quiz00000000000000abc",
  "title": "Sample Quiz",
  "assigned": true,
  "alreadyAssigned": false
}
```

| Field | Meaning |
|---|---|
| `assigned` | `true` when the student was newly added to the quiz roster |
| `alreadyAssigned` | `true` when the student was already on the roster (idempotent success) |

**Errors:** `404 Quiz not found or not available.` (quiz missing or not `PUBLISHED`)

**Frontend invitation flow**

1. Student opens link → `/student/quizzes/:quizId` (or your app's invite landing route)
2. Ensure logged in + `emailVerified === true`
3. `POST /api/student/quizzes/:quizId/accept-invitation`
4. `GET /api/student/quizzes/:quizId` → show instructions / start button

### POST /api/student/quizzes/:quizId/start

Start a new attempt. Returns `IN_PROGRESS` with `expiresAt = startedAt + durationMinutes * 60_000`.

**Response 201**

```json
{
  "id": "cm1attempt0000000000000abc",
  "quizId": "cm1quiz00000000000000abc",
  "studentId": "cm1student0000000000000abc",
  "startedAt": "2026-06-23T10:00:00.000Z",
  "expiresAt": "2026-06-23T10:30:00.000Z",
  "submittedAt": null,
  "status": "IN_PROGRESS",
  "score": null,
  "maxScore": null,
  "createdAt": "2026-06-23T10:00:00.000Z",
  "updatedAt": "2026-06-23T10:00:00.000Z",
  "answers": []
}
```

**Errors:** `404 unknown / unassigned quiz`, `409 You already have an active attempt for this quiz.`

### GET /api/student/attempts/active

Returns the most recent `IN_PROGRESS` attempt for the current student. If the attempt has expired, the server auto-finalises it (`status = TIMED_OUT`, `submittedAt = now`) and returns `{ attempt: null }` so the frontend can route to the result screen.

**Response 200**

```json
{ "attempt": null }
```

or

```json
{
  "attempt": {
    "attemptId": "cm1attempt0000000000000abc",
    "quizId": "cm1quiz00000000000000abc",
    "startedAt": "2026-06-23T10:00:00.000Z",
    "expiresAt": "2026-06-23T10:30:00.000Z"
  }
}
```

### GET /api/student/attempts/:attemptId/questions

Returns the attempt's questions **without `correctAnswer`**, ordered by `createdAt`. Response includes `expiresAt` and `remainingSeconds` for the client-side countdown.

**Question types**

| `type` | UI | Answer field when saving |
|---|---|---|
| `MCQ` | Show `options` as choices | `selectedOptionId` (option text) |
| `TRUE_FALSE` | Show `"True"` / `"False"` choices | `selectedOptionId` (`"True"` or `"False"`) |
| `SHORT_TEXT` | Single-line text input | `textAnswer` |
| `ESSAY` | Multi-line text area | `textAnswer` |

For `SHORT_TEXT` and `ESSAY`, `options` is typically an empty array. Do not send `correctAnswer` — it is never included in this response.

**Response 200**

```json
{
  "attemptId": "cm1attempt0000000000000abc",
  "quizId": "cm1quiz00000000000000abc",
  "expiresAt": "2026-06-23T10:30:00.000Z",
  "remainingSeconds": 1740,
  "questions": [
    {
      "id": "cm1question0000000000000a",
      "type": "MCQ",
      "text": "What is the capital of France?",
      "options": ["London", "Paris", "Berlin", "Madrid"],
      "order": 0
    },
    {
      "id": "cm1question0000000000000b",
      "type": "SHORT_TEXT",
      "text": "Name the capital of France.",
      "options": [],
      "order": 1
    },
    {
      "id": "cm1question0000000000000c",
      "type": "ESSAY",
      "text": "Explain REST in your own words.",
      "options": [],
      "order": 2
    }
  ]
}
```

**Errors:**
- `404 Attempt not found.`
- `403 Access denied.`
- `409 Attempt is no longer in progress.` (auto-finalised due to expiry)

### PATCH /api/student/attempts/:attemptId/answers

Incrementally save or update answers. Upserts by `(attemptId, questionId)`.

**Request body — choice questions (MCQ / TRUE_FALSE)**

```json
{
  "answers": [
    { "questionId": "cm1question0000000000000a", "selectedOptionId": "Paris" }
  ]
}
```

**Request body — text questions (SHORT_TEXT / ESSAY)**

```json
{
  "answers": [
    { "questionId": "cm1question0000000000000b", "textAnswer": "Paris" },
    { "questionId": "cm1question0000000000000c", "textAnswer": "REST is an architectural style for APIs..." }
  ]
}
```

**Rules by question type**

| Question type | Send | Do not send |
|---|---|---|
| `MCQ`, `TRUE_FALSE` | `selectedOptionId` | `textAnswer` |
| `SHORT_TEXT`, `ESSAY` | `textAnswer` | `selectedOptionId` |

- `selectedOptionId: null` or omitted on choice questions → skipped
- `textAnswer: null`, omitted, or `""` on text questions → cleared / skipped
- Sending the wrong field for a question type → `400 Bad Request`

**Response 200**

```json
[
  {
    "id": "cm1answer00000000000000abc",
    "attemptId": "cm1attempt0000000000000abc",
    "questionId": "cm1question0000000000000a",
    "selectedOptionId": "Paris",
    "textAnswer": null,
    "isCorrect": null,
    "answeredAt": "2026-06-23T10:05:00.000Z"
  }
]
```

Each answer object includes both `selectedOptionId` and `textAnswer`; the unused field is `null`.

`isCorrect` is `null` while the attempt is `IN_PROGRESS` and gets populated by the auto-scoring service when the attempt is submitted (currently only for `MCQ` / `TRUE_FALSE`; text types are not auto-scored yet).

**Errors:**
- `404 Attempt not found.`
- `403 Access denied.`
- `400 One or more questionIds do not belong to this quiz.`
- `400 Choice questions must use selectedOptionId, not textAnswer.`
- `400 Text questions must use textAnswer, not selectedOptionId.`
- `409 Cannot modify a 'submitted' attempt.`
- `409 Cannot modify a 'timed_out' attempt.` (auto-finalised before this call)

### POST /api/student/attempts/:attemptId/submit

Finalise the attempt. If the attempt is expired at submit time, the server auto-finalises it and returns the `TIMED_OUT` attempt. If `answers` are included, they are saved first.

**Request body**

```json
{ "answers": [] }
```

**Response 201** — full `StudentAttemptResponseDto` with `status: 'SUBMITTED'`, scored by `ScoringService` on submit:

```json
{
  "id": "cm1attempt0000000000000abc",
  "quizId": "cm1quiz00000000000000abc",
  "studentId": "cm1student0000000000000abc",
  "startedAt": "2026-06-23T10:00:00.000Z",
  "expiresAt": "2026-06-23T10:30:00.000Z",
  "submittedAt": "2026-06-23T10:25:00.000Z",
  "status": "SUBMITTED",
  "score": 3,
  "maxScore": 5,
  "createdAt": "2026-06-23T10:00:00.000Z",
  "updatedAt": "2026-06-23T10:25:00.000Z",
  "answers": [
    {
      "id": "cm1answer00000000000000a1",
      "attemptId": "cm1attempt0000000000000abc",
      "questionId": "cm1question0000000000000a",
      "selectedOptionId": "Paris",
      "textAnswer": null,
      "isCorrect": true,
      "answeredAt": "2026-06-23T10:05:00.000Z"
    },
    {
      "id": "cm1answer00000000000000a2",
      "attemptId": "cm1attempt0000000000000abc",
      "questionId": "cm1question0000000000000b",
      "selectedOptionId": "Berlin",
      "textAnswer": null,
      "isCorrect": false,
      "answeredAt": "2026-06-23T10:07:00.000Z"
    }
  ],
  "result": {
    "percentage": 60.0,
    "passed": true,
    "gradedAt": "2026-06-23T10:25:00.500Z"
  }
}
```

`result` is `null` while the attempt is `IN_PROGRESS` and for `TIMED_OUT` attempts (where `ScoringService` was not called). The frontend does not need a separate `GET /api/results/:attemptId` call.

**Errors:** `404`, `403`, `409 Cannot submit a 'submitted' attempt.`

### GET /api/student/attempts/:attemptId/result

Read the result of a finalised attempt. If the attempt is expired and never submitted, the server auto-finalises it before returning. Results remain accessible after a timeout.

**Response 200** — full `StudentAttemptResponseDto` with the scored `answers` and the `Result` summary:

```json
{
  "id": "cm1attempt0000000000000abc",
  "quizId": "cm1quiz00000000000000abc",
  "studentId": "cm1student0000000000000abc",
  "startedAt": "2026-06-23T10:00:00.000Z",
  "expiresAt": "2026-06-23T10:30:00.000Z",
  "submittedAt": "2026-06-23T10:25:00.000Z",
  "status": "SUBMITTED",
  "score": 3,
  "maxScore": 5,
  "createdAt": "2026-06-23T10:00:00.000Z",
  "updatedAt": "2026-06-23T10:25:00.000Z",
  "answers": [
    {
      "id": "cm1answer00000000000000a1",
      "attemptId": "cm1attempt0000000000000abc",
      "questionId": "cm1question0000000000000a",
      "selectedOptionId": "Paris",
      "textAnswer": null,
      "isCorrect": true,
      "answeredAt": "2026-06-23T10:05:00.000Z"
    },
    {
      "id": "cm1answer00000000000000a2",
      "attemptId": "cm1attempt0000000000000abc",
      "questionId": "cm1question0000000000000b",
      "selectedOptionId": "Berlin",
      "textAnswer": null,
      "isCorrect": false,
      "answeredAt": "2026-06-23T10:07:00.000Z"
    }
  ],
  "result": {
    "percentage": 60.0,
    "passed": true,
    "gradedAt": "2026-06-23T10:25:00.500Z"
  }
}
```

`result` is `null` while the attempt is `IN_PROGRESS` and for `TIMED_OUT` attempts (where `ScoringService` was not called). The frontend does not need a separate `GET /api/results/:attemptId` call.

**Errors:**
- `404 Attempt not found.`
- `403 Access denied.`
- `409 Attempt has not been submitted yet.` (still `IN_PROGRESS`)

## Timer semantics

- `expiresAt` is computed at `POST /student/quizzes/:quizId/start` as `startedAt + quiz.durationMinutes * 60_000` and persisted on the `Attempt` row.
- Every read/mutate endpoint runs `autoFinalizeIfExpired(attempt)`. If `status === IN_PROGRESS` and `now >= expiresAt`, the row is updated to `status: 'TIMED_OUT'`, `submittedAt: now`.
- The `GET /student/attempts/active` endpoint, when it returns an expired attempt, treats the auto-finalised row as "no active attempt" and returns `{ attempt: null }`.

## Dependencies

| Internal service | Source module | Used by `StudentAttemptOrchestrator` for |
|---|---|---|
| `AttemptsService.start / saveAnswers / submit / getResult` | `src/modules/attempts/` | start, save answers, submit, get result |
| `QuestionsService.getQuestions` | `src/modules/questions/` | list attempt questions |
| `PrismaService` | `src/common/prisma/` | direct reads, ownership checks, timer writes |

`Quiz` reads are done directly via `PrismaService` (the `QuizService` is admin-only and not exported from `QuizModule`).

## Frontend rule

The frontend must complete the entire student flow using only `/api/auth` and `/api/student`. Do not call `/api/attempts`, `/api/questions`, or `/api/admin/quizzes` from the student UI.

## Postman collection

A complete Postman collection covering this contract lives at `docs/postman/quiz-platform.postman_collection.json` (with the environment at `docs/postman/quiz-platform.postman_environment.json`).
