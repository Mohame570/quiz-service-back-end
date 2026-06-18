# Quiz Admin API Contract

## Contract Name

- owner module: quiz
- sprint: internship-round-1
- status: active
- last updated: 2026-06-18

## Purpose

Admin endpoints for managing quizzes. These endpoints provide CRUD operations for quiz creation, modification, and retrieval. The `/api/admin/` namespace preserves the intent for future admin authorization.

## Interface Type

- HTTP endpoint

---

## Endpoints

### 1. Create Quiz

**Endpoint:** `POST /api/admin/quizzes`

**Owner Module:** `quiz`

**Request Payload:**

```json
{
  "title": "string (required)",
  "description": "string (required)",
  "status": "draft | published (required, defaults to draft)",
  "durationMinutes": "number (required)",
  "passingScore": "number (required)",
  "startsAt": "ISO 8601 date string (required)",
  "endsAt": "ISO 8601 date string (required)",
  "createdById": "string (required)"
}
```

**Response Payload:**

```json
{
  "id": "string (cuid)",
  "title": "string",
  "description": "string | null",
  "status": "DRAFT | PUBLISHED",
  "durationMinutes": "number | null",
  "passingScore": "number | null",
  "startsAt": "ISO 8601 datetime | null",
  "endsAt": "ISO 8601 datetime | null",
  "createdById": "string | null",
  "createdAt": "ISO 8601 datetime",
  "updatedAt": "ISO 8601 datetime"
}
```

**Validation Rules:**

- `title` is required and must be a non-empty string.
- `status` is case-insensitive; valid values are `draft` or `published`. Defaults to `DRAFT` if omitted.
- Creating a quiz with `status: published` is rejected because a new quiz has no questions yet. Create as draft, add questions, then call the publish endpoint.
- Date fields (`startsAt`, `endsAt`) must be valid ISO 8601 strings if provided.
- All other fields are optional.

**Status Code:**

- `201 Created` on success
- `400 Bad Request` if validation fails or `status: published` is provided

---

### 2. Update Quiz

**Endpoint:** `PATCH /api/admin/quizzes/:id`

**Owner Module:** `quiz`

**Request Payload:**

```json
{
  "title": "string (optional)",
  "description": "string (optional)",
  "status": "draft | published (optional)",
  "durationMinutes": "number (optional)",
  "passingScore": "number (optional)",
  "startsAt": "ISO 8601 date string (optional)",
  "endsAt": "ISO 8601 date string (optional)",
  "createdById": "string (optional)"
}
```

**Response Payload:**

Same as Create Quiz response.

**Validation Rules:**

- All fields are optional.
- `status` is case-insensitive; valid values are `draft` or `published`.
- Updating `status` to `published` requires the quiz to have at least one question.
- Date fields must be valid ISO 8601 strings if provided.
- Only provided fields are updated; omitted fields remain unchanged.

**Status Code:**

- `200 OK` on success
- `400 Bad Request` if validation fails or publishing is attempted with no questions
- `404 Not Found` if quiz with given `id` does not exist

---

### 3. Publish Quiz

**Endpoint:** `POST /api/admin/quizzes/:id/publish`

**Owner Module:** `quiz`

**Request Payload:** None

**Response Payload:**

Same as Create Quiz response, with `status` set to `PUBLISHED`.

**Behavior:**

- Verifies the quiz exists.
- Counts questions where `quizId` matches the quiz id.
- Publishes the quiz only when it has one or more questions.

**Status Code:**

- `200 OK` on success
- `400 Bad Request` if the quiz has no questions
- `404 Not Found` if quiz with given `id` does not exist

---

### 4. Delete Quiz

**Endpoint:** `DELETE /api/admin/quizzes/:id`

**Owner Module:** `quiz`

**Request Payload:** None

**Response Payload:**

```json
{
  "deleted": true,
  "id": "string (cuid)"
}
```

**Behavior:**

- Performs a hard delete (record is permanently removed from the database).
- No soft delete or archiving is performed.

**Status Code:**

- `200 OK` on success
- `404 Not Found` if quiz with given `id` does not exist

---

### 5. Get Single Quiz

**Endpoint:** `GET /api/admin/quizzes/:id`

**Owner Module:** `quiz`

**Request Payload:** None

**Response Payload:**

Same as Create Quiz response.

**Status Code:**

- `200 OK` on success
- `404 Not Found` if quiz with given `id` does not exist

---

### 6. List Quizzes

**Endpoint:** `GET /api/admin/quizzes`

**Owner Module:** `quiz`

**Query Parameters:**

```
status: optional, case-insensitive
  - Accepted values: "draft" or "published"
  - If omitted, all quizzes are returned regardless of status
  - "archived" is not accepted by this endpoint
```

**Request Payload:** None

**Response Payload:**

```json
[
  {
    "id": "string",
    "title": "string",
    "description": "string | null",
    "status": "DRAFT | PUBLISHED",
    "durationMinutes": "number | null",
    "passingScore": "number | null",
    "startsAt": "ISO 8601 datetime | null",
    "endsAt": "ISO 8601 datetime | null",
    "createdById": "string | null",
    "createdAt": "ISO 8601 datetime",
    "updatedAt": "ISO 8601 datetime"
  }
]
```

**Behavior:**

- Without `status`: returns all quizzes in any status.
- With `status=draft`: returns only quizzes with status `DRAFT`.
- With `status=published`: returns only quizzes with status `PUBLISHED`.
- `archived` status is not supported by this endpoint.

**Status Code:**

- `200 OK` on success
- `400 Bad Request` if status query parameter is invalid

---

## Auth Or Access Rules

- **Current state:** No authentication is enforced.
- **Future state:** Once Auth module is available, admin access will be guarded with role-based authorization via decorators.

## Side Effects

- **Create:** A new quiz record is created in the database.
- **Update:** Only provided fields are updated; omitted fields remain unchanged. Publishing through update requires at least one question.
- **Publish:** Quiz status is updated to `PUBLISHED` only after the quiz has at least one question.
- **Delete:** Quiz record is permanently removed (hard delete).
- **Get/List:** Read-only operations with no side effects.

## Dependencies

- **PrismaService:** All database operations use the shared `PrismaService` from `src/common/prisma/`.
- **ValidationPipe:** NestJS global `ValidationPipe` validates all request payloads using class-validator decorators.
- **Quiz Prisma Model:** The API maps to the existing `Quiz` model in `prisma/schema.prisma`.

**Future Dependencies:**

- **Auth Module (L1):** Once available, the Auth module will own authorization checks for admin access.

## Important Notes

- **Status Mapping:** Request status values (`draft`, `published`) are mapped case-insensitively to Prisma enum values (`DRAFT`, `PUBLISHED`).
- **Publish Rule:** A quiz must have at least one related `Question` record before it can become `PUBLISHED`.
- **Hard Delete:** Delete operations permanently remove the record. There is no soft delete or archival in this phase.
- **No Transactions:** Individual operations are not wrapped in Prisma transactions at this stage.

## Open Questions

- Should GET list endpoints support pagination (limit, offset, cursor)?
- Should the API support sorting by `createdAt`, `updatedAt`, or other fields?
- Should relationships to Questions, Attempts, or Students be loaded eagerly in responses?
- Should createdById be validated against a User model once Auth is complete?
