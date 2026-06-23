# Student Module (L4)

Owner: Learner 4 — Student Quiz Solving & Email Link Flow.

## Scope of this iteration

The student module is the **public API surface for the frontend**. It exposes the full quiz-solving flow under `/api/student` and orchestrates the internal `AttemptsService` and `QuestionsService` via `StudentAttemptOrchestrator`. Frontend must call only `/api/auth` and `/api/student` — never `/api/attempts`, `/api/questions`, or `/api/admin/quizzes` directly.

## Endpoints

| Method | Path                                            | Purpose                                   |
|--------|-------------------------------------------------|-------------------------------------------|
| GET    | `/api/student/quizzes`                          | List PUBLISHED quizzes the student can take |
| GET    | `/api/student/quizzes/:quizId`                  | Quiz instruction screen                   |
| POST   | `/api/student/quizzes/:quizId/start`            | Start an attempt (stamps `expiresAt`)     |
| GET    | `/api/student/attempts/active`                  | Resume the current in-progress attempt    |
| GET    | `/api/student/attempts/:attemptId/questions`    | Get the attempt's questions (no `correctAnswer`) |
| PATCH  | `/api/student/attempts/:attemptId/answers`      | Incrementally save / update answers       |
| POST   | `/api/student/attempts/:attemptId/submit`       | Finalise the attempt                      |
| GET    | `/api/student/attempts/:attemptId/result`       | Read the result (works after timeout)     |

All endpoints are guarded by `JwtAuthGuard`, `EmailVerifiedGuard`, and `StudentRoleGuard`.

## Timer & auto-submit semantics

- `expiresAt = startedAt + quiz.durationMinutes * 60_000` is persisted at start.
- Every read/mutate endpoint runs `autoFinalizeIfExpired(attempt)`:
  - If `status === IN_PROGRESS` and `now >= expiresAt`, the row is updated to `status: 'TIMED_OUT'`, `submittedAt: now`.
  - Expired attempts are no longer modifiable; their results are still readable.
- `GET /api/student/attempts/active` returns `{ attempt: null }` once the active attempt has been auto-finalised.

## Schema dependency

- New field on `Attempt`: `expiresAt DateTime` (matches the column added by migration `20260623120000_quiz_duration_attempt_expiration`).
- The DB column already existed before this change; the schema was updated to match.

## Internal services used

| Service | Source | Used for |
|---|---|---|
| `AttemptsService` | `src/modules/attempts/` | start, save answers, submit, get result |
| `QuestionsService` | `src/modules/questions/` | list quiz questions |
| `PrismaService` | `src/common/prisma/` | direct reads, ownership checks, timer writes |

`Quiz` reads are done directly via `PrismaService`.

## Tests

```bash
npm test -- --testPathPatterns=student
```

`test/student.e2e-spec.ts` — service-level tests of `StudentService` with mocked `PrismaService`, `AttemptsService` (via the orchestrator), and `QuestionsService`. Covers:

- 12 tests for `listQuizzesForStudent`
- 6 tests for `getQuizInstructions`
- 4 tests for `getActiveAttempt` (including auto-finalise)
- 4 tests for `startAttempt` (including `expiresAt` stamping)
- 5 tests for `getAttemptQuestions` (including `correctAnswer` stripped)
- 6 tests for `saveAttemptAnswers`
- 3 tests for `submitAttempt` (including auto-finalise returns `TIMED_OUT`)
- 4 tests for `getAttemptResult`
- 6 timer utility tests

Run with:

```bash
npm run lint
npm run build
npm test
```

## Postman collection

`docs/postman/quiz-platform.postman_collection.json` covers the full flow with example payloads, success and error responses, and auto-populated collection variables.
