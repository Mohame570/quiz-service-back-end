# Admin Essay Grading API

Admin-only endpoints under `/api/admin/analytics/grading/*` for manually grading ESSAY answers. Implemented in the Analytics module.

Requires `Authorization: Bearer <admin-token>`.

## Scoring model

| Type | Graded on submit | Admin action |
|------|------------------|--------------|
| MCQ / TRUE_FALSE | Auto (`pointsEarned` 0 or full points) | None |
| SHORT_TEXT | Auto (trim + case-insensitive match) | None |
| ESSAY | Deferred when student provided text | `PATCH .../answers/:answerId` with `pointsEarned` |

While essays are pending, `Result.gradingStatus` is `PARTIAL`, `pendingEssayCount > 0`, and `passed` is `null`. After all essays are graded, status becomes `COMPLETE` and `passed` is calculated from `Quiz.passingScore` (default 50%).

## GET /api/admin/analytics/grading/queue

List submitted attempts with pending essay grading.

Query: `?quizId=` (optional)

```json
{
  "items": [{
    "attemptId": "...",
    "quizId": "new-quiz-5",
    "quizTitle": "Algorithms & Data Structures",
    "studentEmail": "student1@example.com",
    "studentName": "Student One",
    "submittedAt": "2026-06-23T10:25:00.000Z",
    "pendingEssayCount": 1,
    "currentScore": 5,
    "maxScore": 6
  }]
}
```

## GET /api/admin/analytics/grading/attempts/:attemptId

Full attempt detail for grading UI, including `pendingManualGrade` per answer.

## PATCH /api/admin/analytics/grading/attempts/:attemptId/answers/:answerId

Grade one ESSAY answer with partial credit.

```json
{ "pointsEarned": 1 }
```

- `0 <= pointsEarned <= question.points`
- Recalculates attempt `score`, `Result.percentage`, and flips to `COMPLETE` when no essays remain pending

## Seeded demo data

After `npm run db:seed`, `student1@example.com` has a **SUBMITTED** attempt on **`new-quiz-5`** with `gradingStatus: PARTIAL` and one essay awaiting grade. Use that attempt in Postman (`GET .../grading/queue`).
