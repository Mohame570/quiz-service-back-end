# Security Verification

## Overview

This document summarizes the authentication, authorization, and ownership changes implemented across the protected backend endpoints.

The security model uses:

- JWT authentication through `JwtAuthGuard`
- Role-based authorization through `RolesGuard`
- `ADMIN` role requirements for admin endpoints
- Authenticated user identity from the JWT for quiz ownership checks

### Expected Security Behavior

- `401 Unauthorized` — no valid JWT is provided.
- `403 Forbidden` — the user is authenticated but does not have the required role or ownership.
- `200/201` — the request is authorized and the endpoint is allowed to continue.

---

## Notifications Admin

### Controller

`NotificationsAdminController`

### Base Route

`/api/admin/notifications`

### Security

The controller uses:

- `JwtAuthGuard`
- `RolesGuard`
- `ADMIN` role requirement

### Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/admin/notifications/delivery-summary` | Returns aggregated delivery statistics |
| GET | `/api/admin/notifications/invitation-status` | Returns invitation delivery status grouped by quiz |
| POST | `/api/admin/notifications/send-invitation` | Sends quiz invitation emails |
| POST | `/api/notifications/delivery-logs/:deliveryLogId/resend` | Resends a notification delivery |

### Authorization

All admin notification endpoints require:

- A valid JWT
- `ADMIN` role

### Verification

The endpoints were tested with:

- No JWT → `401 Unauthorized`
- Student JWT → `403 Forbidden`
- Admin JWT → Authorized access

---

## Questions

### Controller

`QuestionsController`

### Base Route

`/api/questions`

### Security

The Questions controller uses the configured role-based authorization for the protected question-management operations.

### Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/questions` | Returns questions |
| GET | `/api/questions/:id` | Returns a question by ID |
| POST | `/api/questions` | Creates a question |
| PATCH | `/api/questions/:id` | Updates a question |
| DELETE | `/api/questions/:id` | Deletes a question |

### Authorization

Protected question-management operations require the appropriate authenticated role through the JWT and role guards.

### Verification

Security behavior was verified through the E2E test suite.

---

## Quiz Admin

### Controller

`QuizController`

### Base Route

`/api/admin/quizzes`

### Security

The controller uses:

- `JwtAuthGuard`
- `RolesGuard`
- `ADMIN` role requirement

### Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/admin/quizzes` | Creates a quiz |
| GET | `/api/admin/quizzes` | Returns quizzes |
| GET | `/api/admin/quizzes/:id` | Returns a quiz by ID |
| PATCH | `/api/admin/quizzes/:id` | Updates a quiz |
| DELETE | `/api/admin/quizzes/:id` | Deletes a quiz |
| POST | `/api/admin/quizzes/:id/publish` | Publishes a quiz | ok
| POST | `/api/admin/quizzes/:id/unpublish` | Unpublishes a quiz | ok
| POST | `/api/admin/quizzes/:id/copy` | Copies a quiz |
| POST | `/api/admin/quizzes/:id/questions` | Attaches questions to a quiz | ok

### Authorization

Admin endpoints require:

- A valid JWT
- `ADMIN` role

### Quiz Ownership

Quiz ownership is determined using the authenticated user's identity from the JWT.

The user identity is no longer taken from request data when determining quiz ownership.

Ownership checks are applied to quiz operations where the authenticated user must own the quiz.

### Verification

The security E2E tests verify:

- No JWT → `401 Unauthorized`
- Non-admin JWT → `403 Forbidden`
- Admin JWT → Authorized access
- Ownership is determined from the authenticated JWT user

---

## Security E2E Tests

Security behavior is covered by:

`test/security.e2e-spec.ts`

The tests verify authentication and authorization using real HTTP requests and JWT Bearer tokens.

### Covered Scenarios

- Unauthenticated request → `401`
- Authenticated student request → `403`
- Authenticated admin request → authorized
- Quiz ownership is evaluated using the authenticated JWT identity

Example:

```ts
const studentToken = jwtService.sign(STUDENTUSER);

const response = await request(app.getHttpServer())
  .get(URL)
  .set('Authorization', `Bearer ${studentToken}`);

expect(response.status).toBe(403);