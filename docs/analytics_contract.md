# Analytics API Contract

## 1. Endpoint or Event Name

- `GET /api/analytics`
- `GET /api/analytics/quizzes/:quizId/attempts`

## 2. Owner Module

- `AnalyticsModule`

## 3. Request Payload

### `GET /api/analytics`
- No request body.
- No query parameters.
- No path parameters.

### `GET /api/analytics/quizzes/:quizId/attempts`
- Path parameters:
  - `quizId` (string/cuid, required): The ID of the quiz to retrieve attempt details for.
- No request body.
- No query parameters.

## 4. Response Payload

### `GET /api/analytics`

```json
{
  "totalQuizzes": 0,
  "totalStudents": 0,
  "totalAttempts": 0,
  "averageScore": 0
}
```

Fields:
- `totalQuizzes` (number): Total number of quizzes in the system.
- `totalStudents` (number): Total number of students.
- `totalAttempts` (number): Total number of quiz attempts.
- `averageScore` (number): Average score across all attempts.

### `GET /api/analytics/quizzes/:quizId/attempts`

```json
{
  "quizId": "quiz_abc123",
  "quizTitle": "Sample Quiz",
  "attemptCount": 1,
  "attempts": [
    {
      "attemptId": "attempt_abc123",
      "studentName": "Student Name",
      "score": 0,
      "submittedAt": "2026-06-10T00:00:00.000Z"
    }
  ]
}
```

Fields:
- `quizId` (string): The quiz identifier.
- `quizTitle` (string): The quiz title.
- `attemptCount` (number): Number of attempts for the quiz.
- `attempts` (array): List of attempt objects.

Attempt object fields:
- `attemptId` (string): Unique attempt identifier.
- `studentName` (string): Name of the student.
- `score` (number): Score achieved on the attempt.
- `submittedAt` (string): ISO timestamp for submission.

## 5. Validation Rules

### `GET /api/analytics`
- No validation required for request payload.

### `GET /api/analytics/quizzes/:quizId/attempts`
- `quizId` must be a valid quiz identifier (cuid string).
- Requests with missing or empty `quizId` should return HTTP 400.

## 6. Dependencies on Other Modules

- `PrismaModule`: used to load quiz and attempt data.
- Potential future dependency on `auth` or `student` modules for access control and student identity mapping.

## 7. Open Questions

- Should analytics endpoints require authentication and/or admin authorization?
- What exact quiz and attempt fields should be included in the response for real reporting use cases?
- Should `GET /api/analytics/quizzes/:quizId/attempts` support paging or filtering?
- Will the `quizTitle` come from the quiz module directly or via a shared quiz contract?


## Notes
- Authentication and authorization are not yet defined for this module; implement them when analytics access rules are established.
- The current implementation returns placeholder data. Replace placeholder values with actual Prisma queries against the quiz and attempt models once the schema is available.
- This contract should be updated if additional analytics endpoints are added or if response fields change.
