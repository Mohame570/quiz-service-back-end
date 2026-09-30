# PitIQ — Round 2 Handover (Sprint 4)

## 1. Demo seed setup

Deterministic seed lives in `prisma/seed-demo.ts` (the legacy `prisma/seed.ts`
is untouched — live-test fixtures still work).

```powershell
# one-time: install deps, push migrations
npm install
npx prisma migrate deploy
npx prisma generate

# load the demo story (idempotent — safe to run any number of times)
npx tsx prisma/seed-demo.ts

# double-seed checklist (must print identical JSON twice)
npx tsx prisma/verify-demo-seed.ts > seed-check-1.txt
npx tsx prisma/seed-demo.ts
npx tsx prisma/verify-demo-seed.ts > seed-check-2.txt
# diff seed-check-1.txt seed-check-2.txt → no differences expected
```

Demo accounts (password `Password123!`):

| Email | Role | Story |
|---|---|---|
| `demo-admin@example.com` | ADMIN | owns the demo quiz |
| `demo-passer@example.com` | STUDENT | 10/10 → certificate `CERT-DEMO01` |
| `demo-failer@example.com` | STUDENT | 2/10, then retry 8/10 → certificate `CERT-DEMO02` (BEST story) |

Demo quiz `demo-quiz-1` ("PitIQ Demo Assessment"): 5 questions
(MCQ ×2, MULTI_SELECT, CODE_CONTEXT, FILL_BLANK) across Algebra, Geometry,
Python; `passingScore: 60`, `maxAttempts: 3`, `scoreStrategy: BEST`.
Attempt `demo-att-fail-1` carries 3 cheating events for the integrity demo.

## 2. Certificate routes

Backend (`src/modules/certificates/`):

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /api/student/certificates/attempts/:attemptId` | student (JWT) | issue (idempotent) — 403 unless the attempt is the **official passing** attempt |
| `GET /api/student/certificates/attempts/:attemptId` | student (JWT) | fetch own certificate — 404 otherwise (never 403, no existence leak) |
| `GET /api/certificates/:code` | **public** | share-link verification, display fields only |

Frontend (repo `quiz-service-internship-round-1-front-end`):

| Route | Auth | Purpose |
|---|---|---|
| `/certificate/[code]` | public | logged-out certificate view |
| `/student/quiz/result/[attemptId]` | student | "View certificate" button, rendered only when `passed` |

Eligibility rule (server-side, `CertificatesService.issueForAttempt`):
`officialScore` (BEST/LATEST per quiz) must come from the requested attempt
**and** its percentage must be `>= passingScore` (default 50). All other
paths throw 403/404. Display fields are frozen at issuance.

## 3. Student fairness states

| State | Where | Message → next action |
|---|---|---|
| Instructions | `student/quiz/[quizId]` | rules + attempts remaining → Start / Retake |
| Active timer | `solve` header | mm:ss badge → red + warning banner under 60s, autosave note |
| Timeout | solve → result | "finalised automatically" → View result |
| Early window | instructions | "Quiz opens on <date>. Come back then" → disabled Start |
| Closed window | instructions | "window has closed … results still available in your profile" → Profile link |
| No attempts left | solve error | "No attempts left … review official score" → quiz list |
| Result pass | result page | score + certificate button |
| Result fail | result page | score + retake button (if attempts remain) |

## 4. Run instructions

```powershell
# backend (http://localhost:3002)
npm run start:dev
npm run build
npm run test        # e2e suite, incl. test/certificates.e2e-spec.ts

# frontend (http://localhost:3000)
npm run dev
npx tsc --noEmit
npm test            # __tests__/answer-status, __tests__/question-validation
```

Environment: copy `.env.example` → `.env` and set `DATABASE_URL`
(postgres, default `postgresql://postgres:postgres@localhost:5432/quiz_service`).
No new variables were introduced in Sprint 4.
