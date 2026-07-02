# Questions Contract

> **Internal use only.** These endpoints are used by the admin question bank and by the Student module's `StudentAttemptOrchestrator`. The student-facing flow does not call `/api/questions` directly — questions are returned as part of `GET /api/student/attempts/:attemptId/questions`.

## Contract Name

- owner module: `Questions`
- sprint: `1`
- status: `implemented`
- last updated: `2026-07-02`

## Purpose

This contract defines the API for managing questions within quizzes. Supported types: `MCQ`, `TRUE_FALSE`, `SHORT_TEXT`, and `ESSAY`.

## Interface Type

- HTTP endpoint

## Request Or Input

### Create Question Endpoint

`POST /questions`

**Request Body (`CreateQuestionDto`)**

- `quizId`: `string`
- `type`: `QuestionType` (`MCQ`, `TRUE_FALSE`, `SHORT_TEXT`, or `ESSAY`)
- `text`: `string`
- `options`: `string[]` (required for `MCQ`; omit or `[]` for other types)
- `correctAnswer`: `string` (see validation rules per type)
- `points`: `number` (optional, min 1, default 1)
- `order`: `number` (optional, min 0, default 0)

### Update Question Endpoint

`PATCH /questions/:id`

**Request Body (`UpdateQuestionDto`)**

- `type`: `QuestionType` (`MCQ`, `TRUE_FALSE`, `SHORT_TEXT`, or `ESSAY`) (optional)
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
- `type` must be a valid `QuestionType` enum value (`MCQ`, `TRUE_FALSE`, `SHORT_TEXT`, or `ESSAY`).
- `text` must be a non-empty string.
- `options` is required and must be an array with at least 2 unique items if `type` is `MCQ`.
- `correctAnswer` validation by type:
  - `TRUE_FALSE` — must be exactly `"True"` or `"False"`.
  - `MCQ` — must be one of the strings in `options`.
  - `SHORT_TEXT` — required non-empty string (model answer for future auto-scoring).
  - `ESSAY` — optional; defaults to `""` if omitted (not used for auto-scoring today).
- `points` must be an integer >= 1.
- `order` must be an integer >= 0.
- **PUBLISHED Quiz Guard**: Creation, modification, or deletion of questions will return `403 Forbidden` if the associated `Quiz` has `status === 'PUBLISHED'`.

## Student-facing answer mapping (for frontend reference)

When students save answers via `PATCH /api/student/attempts/:attemptId/answers`:

| Question type | Request field | Example |
|---|---|---|
| `MCQ`, `TRUE_FALSE` | `selectedOptionId` | `"Paris"` or `"True"` |
| `SHORT_TEXT`, `ESSAY` | `textAnswer` | `"My answer text"` |

See [`docs/api/student.md`](student.md) for the full student save-answers contract.

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

**SHORT_TEXT example**

```json
POST /questions
Content-Type: application/json

{
  "quizId": "cm1abcdef0000xyz123456789",
  "type": "SHORT_TEXT",
  "text": "Name the capital of France.",
  "correctAnswer": "Paris"
}
```

**ESSAY example**

```json
POST /questions
Content-Type: application/json

{
  "quizId": "cm1abcdef0000xyz123456789",
  "type": "ESSAY",
  "text": "Explain REST in your own words."
}
```
