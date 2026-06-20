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
| student1@example.com | STUDENT | quiz-1, quiz-2 |
| student2@example.com | STUDENT | quiz-1, quiz-4 |

## Quizzes

| ID | Title | Status | Questions | Window |
|----|-------|--------|-----------|--------|
| seed-live-test-quiz | Live Test Quiz | PUBLISHED | 0 | - |
| quiz-1 | Sprint 1 Assessment | PUBLISHED | 5 | 2026 (active) |
| quiz-2 | Practice Quiz | PUBLISHED | 3 | Always open |
| quiz-3 | Draft Quiz | DRAFT | 0 | - |
| quiz-4 | Closed Quiz | PUBLISHED | 2 | Jan 2026 (closed) |

## Attempts

| Student | Quiz | Status | Score |
|---------|------|--------|-------|
| student1 | quiz-1 | IN_PROGRESS | - |
| student1 | quiz-2 | SUBMITTED | 80/100 |
| student2 | quiz-1 | SUBMITTED | 100/100 |
| student2 | quiz-1 | SUBMITTED | 60/100 |
| student2 | quiz-4 | TIMED_OUT | - |

## Quick Test Commands

```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"student1@example.com","password":"Password123!"}'

# List student quizzes
curl http://localhost:3000/api/student/quizzes \
  -H "Authorization: Bearer <token>"

# Get quiz instructions
curl http://localhost:3000/api/student/quizzes/quiz-1 \
  -H "Authorization: Bearer <token>"

# Start attempt
curl -X POST http://localhost:3000/api/attempts \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"quizId":"quiz-1"}'

# Get active attempt
curl http://localhost:3000/api/student/attempts/active \
  -H "Authorization: Bearer <token>"
```
