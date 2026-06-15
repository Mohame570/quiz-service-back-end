# Student API Contract

**Owner:** L4  
**Module:** `src/modules/student/`  
**Sprint:** 1 foundation, Sprint 2 solving integration

## Endpoints

### GET /api/student/quizzes

Returns published quizzes assigned to the current student.

**Auth:** Student JWT (stubbed in Sprint 1 — uses `req.user.sub` when present)

**Response 200**

```json
{
  "items": [
    {
      "id": "cuid",
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

**Filtering rules**

- Only `PUBLISHED` quizzes
- Only quizzes linked in `_QuizToStudentProfile` (student must be assigned)
- Excludes quizzes outside their `startsAt` / `endsAt` window

### GET /api/student/quizzes/:id

Quiz instructions / pre-start screen.

**Response 200** — list item fields plus:

```json
{
  "canStart": true,
  "reasonIfBlocked": null,
  "attemptId": null
}
```

**Errors**

- `404` — quiz not found, not published, or student not assigned

### GET /api/student/attempts/active

Returns the student's most recent `IN_PROGRESS` attempt.

**Response 200**

```json
{
  "attempt": {
    "attemptId": "cuid",
    "quizId": "cuid",
    "startedAt": "2026-06-01T10:00:00.000Z",
    "expiresAt": "2026-06-01T10:30:00.000Z"
  }
}
```

`attempt` is `null` when no active attempt exists.

## Dependencies

- `L2 Quiz` — quiz records and publish status
- `L5 Attempts` — attempt status for list/instructions
- `L1 Auth` — real JWT guard (Sprint 2)
- Quiz assignment data in `_QuizToStudentProfile` (admin/invite flow — Sprint 2 L2)

## Sprint 2 notes

- Wire `@UseGuards(JwtAuthGuard)` once L1 ships guards
- Solving UI will call `L5 /api/attempts` after instructions screen
- Email deep links should route frontend to `/student/quizzes/:id`
