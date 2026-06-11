# Questions Contract

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

## Response Or Output

Returns the newly created `Question` record containing:

- `id`: `string` (cuid)
- `quizId`: `string`
- `type`: `QuestionType`
- `text`: `string`
- `options`: `Array<{ id: string, text: string, isCorrect: boolean }>`
- `createdAt`: `DateTime`
- `updatedAt`: `DateTime`

## Validation Rules

- `quizId` must be a non-empty string.
- `type` must be a valid `QuestionType` enum value (`MCQ` or `TRUE_FALSE`).
- `text` must be a non-empty string.
- `options` is required and must be an array of strings with at least 2 items if `type` is `MCQ`.
- `correctAnswer` must not be empty.
  - If `type` is `TRUE_FALSE`, `correctAnswer` must be exactly `"True"` or `"False"`.
  - If `type` is `MCQ`, `correctAnswer` must be one of the strings provided in the `options` array.

## Auth Or Access Rules

Currently, there are no specific authentication or access rules defined at the controller level (to be integrated).

## Side Effects

- Persists a new `Question` record into the database, linked to the provided `quizId`.
- Creates related `QuestionOption` records for the options array.

## Dependencies

- **Prisma Models**: Depends on the `Question`, `QuestionOption`, and `Quiz` models.
- **Enums**: Relies on the `QuestionType` enum from the generated Prisma client.

## Design Justification & Extensibility

- **Extracted `QuestionOption` Model**: We separated MCQ and True/False options into their own model (`QuestionOption`) with independent UUIDs. This prevents text-matching errors during runtime grading (e.g. if the text of an option changes), obscures the free-text correct answer from attempts which bolsters integrity, and allows translation extensions without breaking the scoring engine.

## Open Questions

- Should we add authentication guards or ownership validation (e.g. ensure the user creating the question is the creator of the quiz)?
- Will there be endpoints for updating or deleting questions?

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
  "options": [
    {
      "id": "cm1abcdef0000xyz123456711",
      "text": "London",
      "isCorrect": false
    },
    {
      "id": "cm1abcdef0000xyz123456712",
      "text": "Paris",
      "isCorrect": true
    },
    {
      "id": "cm1abcdef0000xyz123456713",
      "text": "Berlin",
      "isCorrect": false
    },
    {
      "id": "cm1abcdef0000xyz123456714",
      "text": "Madrid",
      "isCorrect": false
    }
  ],
  "createdAt": "2026-06-11T00:00:00.000Z",
  "updatedAt": "2026-06-11T00:00:00.000Z"
}
```
