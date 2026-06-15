# Auth API Contract

**Owner:** L1  
**Module:** `src/modules/auth/`  
**Sprint:** 1 foundation, Sprint 2 verification flow

## Endpoints

### POST /api/auth/register

Create a new user account.

**Request**

```json
{
  "name": "Student Name",
  "email": "student@example.com",
  "password": "password123",
  "role": "STUDENT"
}
```

**Response 201**

```json
{
  "user": {
    "id": "cuid",
    "email": "student@example.com",
    "role": "STUDENT",
    "emailVerified": false,
    "createdAt": "2026-06-01T00:00:00.000Z",
    "updatedAt": "2026-06-01T00:00:00.000Z"
  },
  "tokens": {
    "accessToken": "jwt",
    "tokenType": "Bearer",
    "expiresIn": "1h"
  }
}
```

**Side effects**

- Stores bcrypt password hash
- Generates `verificationToken` (Sprint 2 will send via notification service)
- Creates `StudentProfile` automatically when `role = STUDENT`

### POST /api/auth/login

**Request**

```json
{
  "email": "student@example.com",
  "password": "password123"
}
```

**Response 200** — same shape as register.

## Sprint 2 additions (planned)

- `POST /api/auth/verify-email`
- `POST /api/auth/resend-verification`
- JWT guards on protected modules
- Block unverified students from attempt/solving routes

## Dependencies

- `PrismaModule` — `users`, `student_profiles`
- `L7 Notifications` — verification email dispatch (Sprint 2)
