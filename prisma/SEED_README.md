# Seed Data Reference

## Run the Seed

```bash
npx tsx prisma/seed.ts
```

## Verify the Data

```bash
npx tsx prisma/check-db.ts
```

## Test Accounts

All passwords: `Password123!`

| Email | Role | Assigned Quizzes |
|-------|------|------------------|
| admin@live-test.example | ADMIN | - |
| student@live-test.example | STUDENT | seed-live-test-quiz |
| admin1@example.com | ADMIN | - |
| student1@example.com | STUDENT | quiz-1, quiz-2, new-quiz-1 … new-quiz-5 |
| student2@example.com | STUDENT | quiz-1, quiz-4, new-quiz-1 … new-quiz-5 |

## Question Types

Seeded data includes all four `QuestionType` values:

| Type | Save field | Auto-scored on submit |
|------|------------|------------------------|
| MCQ | `selectedOptionId` | Yes |
| TRUE_FALSE | `selectedOptionId` | Yes |
| SHORT_TEXT | `textAnswer` | Yes (trim + case-insensitive vs model answer) |
| ESSAY | `textAnswer` | No — admin manual grade via `/api/admin/analytics/grading/*` |

## Quizzes

| ID | Title | Status | Questions | Types | Window |
|----|-------|--------|-----------|-------|--------|
| seed-live-test-quiz | Live Test Quiz | PUBLISHED | 3 | MCQ, SHORT_TEXT, ESSAY | - |
| quiz-1 | Sprint 1 Assessment | PUBLISHED | 7 | MCQ, TF, SHORT_TEXT, ESSAY | 2026 (active) |
| quiz-2 | Practice Quiz | PUBLISHED | 5 | MCQ, TF, SHORT_TEXT, ESSAY | Always open |
| quiz-3 | Draft Quiz | DRAFT | 2 | SHORT_TEXT, ESSAY | - |
| quiz-4 | Closed Quiz | PUBLISHED | 3 | MCQ, TF, SHORT_TEXT | Jan 2026 (closed) |
| new-quiz-1 | JavaScript Fundamentals | PUBLISHED | 4 | MCQ, TF, SHORT_TEXT | Active |
| new-quiz-2 | World Geography | PUBLISHED | 4 | MCQ, TF, SHORT_TEXT | Always open (1 min) |
| new-quiz-3 | Database Basics | PUBLISHED | 5 | MCQ, TF, ESSAY | Active |
| new-quiz-4 | Web Development | PUBLISHED | 5 | MCQ, TF, SHORT_TEXT | Active |
| new-quiz-5 | Algorithms & DS | PUBLISHED | 6 | MCQ, TF, SHORT_TEXT, ESSAY | Active |
| invite-quiz-1 | Invitation Demo Quiz | PUBLISHED | 4 | MCQ, TF, SHORT_TEXT, ESSAY | Active — **not assigned** to any student |

Use **`invite-quiz-1`** to test `POST /student/quizzes/:quizId/accept-invitation` (works for both `student1` and `student2`). **`quiz-2`** is also unassigned to `student2` only (used by live tests). Re-seeding clears `invite-quiz-1` roster assignments.

## Attempts

| Student | Quiz | Status | Score |
|---------|------|--------|-------|
| student1 | quiz-1 | IN_PROGRESS | - |
| student1 | quiz-2 | SUBMITTED | 80/100 |
| student2 | quiz-1 | SUBMITTED | 100/100 |
| student2 | quiz-1 | SUBMITTED | 60/100 |
| student2 | quiz-4 | TIMED_OUT | - |
| student1 | new-quiz-5 | SUBMITTED (PARTIAL) | 5/6 — essay pending admin grade |

## Admin essay grading demo

After seed, **`student1@example.com`** has a **SUBMITTED** attempt on **`new-quiz-5`** with `gradingStatus: PARTIAL` and one essay awaiting grade.

1. Login as **`admin1@example.com`** / `Password123!`
2. `GET /api/admin/analytics/grading/queue?quizId=new-quiz-5`
3. `GET /api/admin/analytics/grading/attempts/:attemptId`
4. `PATCH /api/admin/analytics/grading/attempts/:attemptId/answers/:answerId` with `{ "pointsEarned": N }`

See [`docs/api/analytics-grading.md`](../docs/api/analytics-grading.md) and Postman **Analytics → Essay Grading** requests.

## Quick Test Commands

```bash
# Login
curl -X POST http://localhost:3002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"student1@example.com","password":"Password123!"}'

# List student quizzes
curl http://localhost:3002/api/student/quizzes \
  -H "Authorization: Bearer <token>"

# Get quiz instructions
curl http://localhost:3002/api/student/quizzes/quiz-1 \
  -H "Authorization: Bearer <token>"

# Start attempt
curl -X POST http://localhost:3002/api/attempts \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"quizId":"quiz-1"}'

# Get active attempt
curl http://localhost:3002/api/student/attempts/active \
  -H "Authorization: Bearer <token>"
```
