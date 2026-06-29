# Questions Contract

> **Internal use only.** These endpoints are used by the admin question bank and by the Student module's `StudentAttemptOrchestrator`. The student-facing flow does not call `/api/questions` directly — questions are returned as part of `GET /api/student/attempts/:attemptId/questions`.

## Contract Name

- owner module: `Questions`
- sprint: `1`
- status: `implemented`
- last updated: `2026-06-11`

## Purpose

This contract defines the API for managing questions within quizzes. It provides an HTTP endpoint to create questions (both Multiple Choice and True/False) and attach them to a specific quiz.

## Interface Type

- HTTP endpoint

## Request Or Input

### Create Question Endpoint

`POST /questions`

**Request Body (`CreateQuestionDto`)**

- `quizId`: `string`
- `type`: `QuestionType` (`MCQ` or `TRUE_FALSE`)
- `text`: `string`
- `options`: `string[]` (optional, used for MCQ)
- `correctAnswer`: `string`
- `points`: `number` (optional, min 1, default 1)
- `order`: `number` (optional, min 0, default 0)

### Update Question Endpoint

`PATCH /questions/:id`

**Request Body (`UpdateQuestionDto`)**

- `type`: `QuestionType` (`MCQ` or `TRUE_FALSE`) (optional)
- `text`: `string` (optional)
- `options`: `string[]` (optional, used for MCQ)
- `correctAnswer`: `string` (optional)
- `points`: `number` (optional, min 1)
- `order`: `number` (optional, min 0)

### Delete Question Endpoint

`DELETE /questions/:id`

**Response**

- Returns the deleted question.

## Response Or Output

Returns the newly created `Question` record containing:

- `id`: `string` (cuid)
- `quizId`: `string`
- `type`: `QuestionType`
- `text`: `string`
- `options`: `string[]`
- `correctAnswer`: `string`
- `points`: `number`
- `order`: `number`
- `createdAt`: `DateTime`
- `updatedAt`: `DateTime`

## Validation Rules

- `quizId` must be a non-empty string.
- `type` must be a valid `QuestionType` enum value (`MCQ` or `TRUE_FALSE`).
- `text` must be a non-empty string.
- `options` is required and must be an array with at least 2 unique items if `type` is `MCQ`.
- `correctAnswer` must not be empty.
  - If `type` is `TRUE_FALSE`, `correctAnswer` must be exactly `"True"` or `"False"`.
  - If `type` is `MCQ`, `correctAnswer` must be one of the strings provided in the `options` array.
- `points` must be an integer >= 1.
- `order` must be an integer >= 0.
- **PUBLISHED Quiz Guard**: Creation, modification, or deletion of questions will return `403 Forbidden` if the associated `Quiz` has `status === 'PUBLISHED'`.

## Auth Or Access Rules

Currently, there are no specific authentication or access rules defined at the controller level (to be integrated).

## Side Effects

- Persists a new `Question` record into the database, linked to the provided `quizId`.

## Dependencies

- **Prisma Models**: Depends on the `Question` and `Quiz` models. The `quizId` must correspond to an existing `Quiz` due to the foreign key relation.
- **Enums**: Relies on the `QuestionType` enum from the generated Prisma client.

## Open Questions

- Should we add authentication guards or ownership validation (e.g. ensure the user creating the question is the creator of the quiz)?

## Example

**Request:**

```json
POST /questions
Content-Type: application/json

{
  "quizId": "cm1abcdef0000xyz123456789",
  "type": "MCQ",
  "text": "What is the capital of France?",
  "options": ["London", "Paris", "Berlin", "Madrid"],
  "correctAnswer": "Paris"
}
```

**Response:**

```json
HTTP/1.1 201 Created
Content-Type: application/json

{
  "id": "cm1abcdeg0001xyz123456780",
  "quizId": "cm1abcdef0000xyz123456789",
  "type": "MCQ",
  "text": "What is the capital of France?",
  "options": ["London", "Paris", "Berlin", "Madrid"],
  "correctAnswer": "Paris",
  "points": 1,
  "order": 0,
  "createdAt": "2026-06-11T00:00:00.000Z",
  "updatedAt": "2026-06-11T00:00:00.000Z"
}
```
