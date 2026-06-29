# Auth API Contract

**Owner:** L1 — Omar Reda  
**Module:** `src/modules/auth/`  
**Sprint:** 1 foundation · 2 verification flow · 3 hardening

---

## Overview

The auth module handles registration, login, email verification, and route protection for the QnA platform. All endpoints are under the `/api/auth/` prefix.

**Key security rules:**
- Passwords are hashed with bcrypt (12 rounds) — never stored plain
- Role is always hardcoded to `STUDENT` on registration — cannot be supplied by the client
- Inactive accounts (`isActive: false`) are blocked at login
- Verification tokens expire after 24 hours
- JWT tokens expire after 1 hour

---

## Endpoints

### POST /api/auth/register

Creates a new student account and sends a verification email.

**Request body**

```json
{
  "name": "Student Name",
  "email": "student@example.com",
  "password": "password123"
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `name` | string | yes | non-empty |
| `email` | string | yes | valid email format |
| `password` | string | yes | minimum 8 characters |

> `role` is intentionally excluded — all self-registered users are always `STUDENT`.
> Admin accounts are created manually.

**Response 201**

```json
{
  "user": {
    "id": "cmqqfqdz...",
    "email": "student@example.com",
    "role": "STUDENT",
    "emailVerified": false,
    "createdAt": "2026-06-01T00:00:00.000Z",
    "updatedAt": "2026-06-01T00:00:00.000Z"
  },
  "tokens": {
    "accessToken": "eyJhbGci...",
    "tokenType": "Bearer",
    "expiresIn": "1h"
  }
}
```

**Error responses**

| Status | Condition |
|---|---|
| 400 | Missing or invalid fields |
| 409 | Email already registered |

**Side effects**
- Password stored as bcrypt hash
- `verificationToken` generated and stored with 24-hour expiry
- Verification email dispatched via L7 NotificationService
- `StudentProfile` row created automatically

---

### POST /api/auth/login

Authenticates a user and returns a JWT.

**Request body**

```json
{
  "email": "student@example.com",
  "password": "password123"
}
```

**Response 201**

Same shape as register response. `emailVerified` will be `false` until the user clicks their verification link — unverified users can log in but cannot access quiz-solving routes.

**Error responses**

| Status | Condition |
|---|---|
| 400 | Missing or invalid fields |
| 401 | Wrong password, email not found, or account inactive |

> Inactive and wrong-password cases both return 401 with the same message (`Invalid email or password`) to prevent user enumeration.

---

### POST /api/auth/verify-email

Consumes a verification token and marks the user as verified.

**Request body**

```json
{
  "token": "c9d11d9f-fb71-41d6-b751-9255f5091dd2"
}
```

**Response 201**

```json
{
  "success": true
}
```

**Error responses**

| Status | Condition |
|---|---|
| 400 | Missing token field |
| 401 | Token not found, already used, or expired (>24h) |

**Side effects**
- Sets `emailVerified: true`
- Clears `verificationToken` and `verificationTokenExpiresAt`
- Idempotent — if already verified, returns `{ success: true }` without writing to DB

---

### POST /api/auth/resend-verification

Generates a new verification token and sends a new email.

**Request body**

```json
{
  "email": "student@example.com"
}
```

**Response 201**

```json
{
  "success": true
}
```

**Error responses**

| Status | Condition |
|---|---|
| 400 | Missing or invalid email field |
| 404 | Email not registered |

**Side effects**
- Generates new token, replaces old one
- Sets new 24-hour expiry
- Sends new verification email via L7 NotificationService
- If already verified, returns `{ success: true }` without sending email

---

## Guards

Three guards are available for other modules to use. Import from `src/modules/auth/guards/`.

### JwtAuthGuard

Validates the `Authorization: Bearer <token>` header, decodes the JWT, and attaches the user payload to `request.user`.

**Must run before `RolesGuard` and `EmailVerifiedGuard`.**

```typescript
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Get('protected')
@UseGuards(JwtAuthGuard)
protectedRoute() {}
```

`request.user` shape after guard runs:
```typescript
{
  sub: string;    // user ID
  email: string;
  role: 'ADMIN' | 'STUDENT';
}
```

**Errors:**

| Status | Condition |
|---|---|
| 401 | Missing Authorization header |
| 401 | Invalid Bearer format |
| 401 | Token expired or invalid signature |

---

### RolesGuard + @Roles() decorator

Enforces role-based access. Must be used after `JwtAuthGuard`.

Import guard from `src/modules/auth/guards/roles.guard.ts`.  
Import decorator from `src/modules/auth/decorators/roles.decorators.ts`.

```typescript
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorators';
import { UserRole } from '../../generated/prisma/client';

// Admin only
@Get('admin/stats')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
getAdminStats() {}

// Student only
@Get('my-quizzes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STUDENT)
getMyQuizzes() {}

// Both roles
@Get('profile')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.STUDENT)
getProfile() {}
```

**Errors:**

| Status | Condition |
|---|---|
| 403 | User role does not match required role |

---

### EmailVerifiedGuard

Blocks unverified users from accessing a route. Use on quiz-solving routes per Sprint 2 requirement.

```typescript
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.gaurd';

@Post('solve')
@UseGuards(JwtAuthGuard, EmailVerifiedGuard)
solveQuiz() {}
```

**Errors:**

| Status | Condition |
|---|---|
| 403 | User not authenticated (no JWT) |
| 403 | Email not verified |

---

## JWT Payload

All guards decode this payload from the token:

```typescript
{
  sub: string;               // user ID
  email: string;
  role: 'ADMIN' | 'STUDENT';
  iat: number;               // issued at (Unix timestamp)
  exp: number;               // expires at (Unix timestamp)
}
```

---

## Dependencies

| Dependency | Purpose |
|---|---|
| `PrismaModule` | `users`, `student_profiles` tables |
| `L7 NotificationService` | Verification email dispatch |
| `@nestjs/jwt` | JWT signing and verification |
| `bcrypt` | Password hashing (12 rounds) |

---

## Current User Model Fields

| Field | Type | Notes |
|---|---|---|
| `id` | string (cuid) | Auto-generated |
| `email` | string | Unique |
| `passwordHash` | string | Never returned in API responses |
| `name` | string? | Optional |
| `role` | ADMIN \| STUDENT | Always STUDENT on registration |
| `emailVerified` | boolean | Starts false |
| `verificationToken` | string? | Cleared after verification |
| `verificationTokenExpiresAt` | DateTime? | 24h from generation |
| `isActive` | boolean | Admins can deactivate accounts |
| `createdAt` | DateTime | Auto-set |
| `updatedAt` | DateTime | Auto-updated |