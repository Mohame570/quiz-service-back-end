# Student Live Testing

**Owner:** L4  
**Module:** `src/modules/student/`  
**General guide:** `docs/testing/live-server-testing.md`

This is the feature-specific live testing note for the student-facing API. It complements the static unit tests in `test/student.e2e-spec.ts` by exercising the full quiz-solving flow end-to-end against the real Docker stack.

## What static tests already cover

`test/student.e2e-spec.ts` runs in-process with a mocked `PrismaService` and mocked orchestrator. It proves:

- DTO validation and the orchestrator wiring
- `expiresAt` stamping at start (`startedAt + durationMinutes * 60_000`)
- Auto-finalise helper behaviour (`autoFinalizeIfExpired`) and the 409 contract for SUBMITTED / TIMED_OUT attempts
- Ownership checks (403 on another student's attempt)
- Question-belongs-to-quiz validation
- Per-answer normalisation (`undefined` → `null`)
- The `withAttemptMetadata` helper merges `expiresAt` + the `Result` row into the response

It does **not** prove:

- The Nest API container starts cleanly against the real Postgres stack
- Migrations and seed data apply successfully in Docker
- The real HTTP flow returns shaped responses end-to-end
- The `ScoringService` (inside the attempts module) actually populates the `Result` row in Postgres
- The 1-minute `expiresAt` timer actually triggers `autoFinalizeIfExpired` over real HTTP

## What live tests prove

File: `test/live/student.live-spec.ts`

13 test cases organised into 4 groups:

### Group 1 — Auth + list + get-by-id

| Step | Validates |
|---|---|
| `POST /api/auth/login` as `student1@example.com` | Real JWT issuance, `emailVerified: true` |
| `GET /api/student/quizzes` | Returns the 5 `new-quiz-*` (all `NOT_STARTED`, no `attemptId`); `new-quiz-2` has `durationMinutes: 1` |
| `GET /api/student/quizzes/new-quiz-1` | Quiz instructions, `questionCount: 4`, `canStart: true` |
| `GET /api/student/quizzes/quiz-1` | Legacy quiz (cuid ids) still reachable |
| `GET /api/student/quizzes/this-quiz-does-not-exist` | 404 (not 400) |
| `GET /api/student/quizzes/cm1nonexistentcuidxxx` | 404 (regression guard for the `ParseUUIDPipe` removal — must NOT 400) |

### Group 2 — Full solve flow on `new-quiz-4` (5 questions, 30 min)

| Step | Validates |
|---|---|
| `POST /api/student/quizzes/new-quiz-4/start` | 201, `IN_PROGRESS`, `expiresAt = startedAt + 30 min` |
| `GET /api/student/attempts/active` | Returns the same attempt |
| `GET /api/student/attempts/:id/questions` | 5 questions, **none have `correctAnswer`** |
| `PATCH /api/student/attempts/:id/answers` (4 correct + 1 wrong) | 200, 5 saved answers |
| `POST /api/student/attempts/:id/submit` | 201, `SUBMITTED`, `score: 4 / maxScore: 5`, **`result: { percentage: 80, passed: true, gradedAt }`** |
| `GET /api/student/attempts/:id/result` | Same shape, no extra writes |
| Second `POST .../submit` on the same attempt | 409 `"Cannot submit a 'submitted' attempt."` |
| `PATCH .../answers` on a SUBMITTED attempt | 409 `"Cannot modify a 'submitted' attempt."` |
| Second `POST .../start` for a quiz that already has an attempt | 409 `"You already have an active attempt for this quiz."` |

### Group 3 — Timeout flow on `new-quiz-2` (1-min duration)

| Step | Validates |
|---|---|
| `POST /api/student/quizzes/new-quiz-2/start` (student2) | 201, `expiresAt ≈ now + 60s` |
| Sleep ~65 s, then `GET /api/student/attempts/:id/questions` | 409 `"Attempt is no longer in progress."` (auto-finalised to `TIMED_OUT`) |
| `GET /api/student/attempts/active` (student2) | `{ attempt: null }` |
| `GET /api/student/attempts/:id/result` | 200, `status: TIMED_OUT`, `result: null`, `score: null`, `maxScore: null` |

### Group 4 — Cross-student isolation

| Step | Validates |
|---|---|
| `GET /api/student/attempts/<student1's attempt>/questions` as student2 | 403 `"Access denied."` |
| `GET /api/student/attempts/<student1's attempt>/result` as student2 | 403 `"Access denied."` |

The 1-minute sleep in group 3 is the only slow test (~65 s real time); the other 12 complete in under 1 s each. Total wall time is ~80 s.

## Run it

### Full automated smoke (runs all live specs)

```powershell
.\scripts\run-live-tests.ps1
```

### Student-only run

```powershell
docker compose up -d --build postgres mailhog api
.\scripts\wait-for-api.ps1
npm run prisma:migrate:deploy
npm run db:seed
$env:LIVE_TESTS = "1"
npm run test:live -- test/live/student.live-spec.ts
```

### Quick check (spec discovery + skip path)

Without `LIVE_TESTS=1` the spec skips all 13 tests cleanly (CI default):

```bash
npm run test:live -- test/live/student.live-spec.ts
```

## Seed data used

`prisma/seed.ts` runs as part of `npm run db:seed`. The student live suite relies on:

| Seed entity | Why |
|---|---|
| `student1@example.com` (`Password123!`) | The primary student used for the full solve flow |
| `student2@example.com` (`Password123!`) | Used for the 1-min timeout + cross-student tests (must not have prior attempts on `new-quiz-2` or `new-quiz-3`) |
| `new-quiz-1` to `new-quiz-5` (PUBLISHED) | Five new quizzes; all are assigned to both students. `new-quiz-2` is the **1-minute timeout test quiz** |
| `new-quiz-4` (Web Development, 5 questions) | The quiz used for the full solve flow test (4 correct + 1 wrong) |
| `new-quiz-3` (Database Basics, 4 questions) | The quiz used for the duplicate-start 409 test |

**No attempts are seeded on the `new-quiz-*` quizzes.** The seed's `cleanupQuizIds` array includes them, so a re-run of the seed (or of the live suite) returns them to a known fresh state.

## Manual HTTP checks

```powershell
# 1. Login
$body = (Invoke-RestMethod -Method POST "http://localhost:3002/api/auth/login" `
  -ContentType "application/json" `
  -Body '{"email":"student1@example.com","password":"Password123!"}').tokens
$token = $body.accessToken
$headers = @{ Authorization = "Bearer $token" }

# 2. List quizzes
Invoke-RestMethod -Headers $headers "http://localhost:3002/api/student/quizzes"

# 3. Start new-quiz-4
$start = Invoke-RestMethod -Method POST -Headers $headers `
  "http://localhost:3002/api/student/quizzes/new-quiz-4/start"
$attemptId = $start.id

# 4. Get questions
Invoke-RestMethod -Headers $headers `
  "http://localhost:3002/api/student/attempts/$attemptId/questions"

# 5. Submit
Invoke-RestMethod -Method POST -Headers $headers `
  -ContentType "application/json" `
  -Body '{"answers":[]}' `
  "http://localhost:3002/api/student/attempts/$attemptId/submit"

# 6. Get result
Invoke-RestMethod -Headers $headers `
  "http://localhost:3002/api/student/attempts/$attemptId/result"
```

For the 1-min timeout test:

```powershell
# Start new-quiz-2 (1 min duration) — login as student2 first
# Wait 65 seconds
# Then GET the questions or the result — both should reflect TIMED_OUT
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Cannot submit a 'submitted' attempt` on the first submit | A prior test run left a SUBMITTED attempt on the quiz | Re-run `npm run db:seed` to reset |
| `409 You already have an active attempt` on the first `POST .../start` | A prior test left an IN_PROGRESS attempt | Re-run `npm run db:seed` |
| Timeout test runs > 80 s | DB latency or API cold start | Increase `jest-live.json` `testTimeout` (currently 120 000) |
| `Validation failed (uuid is expected)` | `ParseUUIDPipe` was re-introduced (regression) | Re-check the student controller — the 6 `ParseUUIDPipe` decorators must stay removed |
| 401 on every request | JWT signing key mismatch across containers | Make sure `.env`'s `JWT_SECRET` matches the value baked into the `api` container at build time |
| Live test skips entirely | `LIVE_TESTS` not set | `LIVE_TESTS=1 npm run test:live -- test/live/student.live-spec.ts` |

## Related docs

- `docs/testing/live-server-testing.md` — general live-testing guide
- `docs/testing/quiz-live-testing.md` — admin quiz API walkthrough
- `docs/api/student.md` — the public student API contract
- `src/modules/student/README.md` — module overview
