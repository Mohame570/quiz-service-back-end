# Notifications Module (L7)

**Owner:** Mohamed Waleed (L7)  
**Sprint 2 focus:** SMTP email transport, delivery logging, resend-failed mechanism

## Purpose

This module is the **single email gateway** for the platform. Other modules (Auth verification, quiz invitations) call it — they do not send email directly.

## Architecture

```text
Auth / Quiz modules
        │
        ▼
NotificationService  ──►  MailTransportService (Nodemailer)
        │                        │
        ▼                        ▼
 email_delivery_logs         SMTP (MailHog in dev)
```

## Public service API

Inject via token or class:

```typescript
import { NOTIFICATION_SERVICE } from './services/notification-service.interface';

constructor(
  @Inject(NOTIFICATION_SERVICE)
  private readonly notifications: NotificationServiceInterface,
) {}
```

### Send emails

| Method | Used by | Template |
|---|---|---|
| `sendVerificationEmail(dto)` | L1 Auth | `VERIFICATION` |
| `sendQuizInvitationEmail(dto)` | L2/L8 bulk invite | `QUIZ_INVITATION` |

Legacy aliases `queueVerificationEmail` / `queueQuizInvitationEmail` still work and now perform real delivery.

### Delivery lifecycle

1. Render HTML + text template
2. Create `email_delivery_logs` row (`PENDING`)
3. Send via Nodemailer
4. Update log to `SENT` (with `deliveredAt`, `providerMessageId`) or `FAILED` (with `errorMessage`)
5. Store rendered payload in `metadata.rendered` for safe resends

### Resend

| Method | Description |
|---|---|
| `resendDeliveryLog(id)` | Retry one failed/pending log |
| `resendFailedDeliveries({ templateKey?, limit? })` | Batch retry all `FAILED` logs |

### Operations / debugging

| Method | Description |
|---|---|
| `listDeliveryLogs(query?)` | Filter by status, template, recipient |

HTTP equivalents (no auth yet — wire guards in a later sprint):

- `GET /api/notifications/delivery-logs`
- `POST /api/notifications/delivery-logs/:id/resend`
- `POST /api/notifications/delivery-logs/resend-failed`

## Configuration

From `.env` (see `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `SMTP_HOST` | `localhost` | SMTP server (MailHog in Docker) |
| `SMTP_PORT` | `1025` | SMTP port |
| `SMTP_USERNAME` | empty | Optional auth |
| `SMTP_PASSWORD` | empty | Optional auth |
| `SMTP_FROM_EMAIL` | `no-reply@example.com` | From address |

## Local testing with MailHog

```bash
docker compose up -d mailhog postgres
npm run start:dev
```

Open MailHog UI: `http://localhost:8025`

## Consumer integration examples

### L1 — verification email after register

```typescript
await this.notifications.sendVerificationEmail({
  recipientEmail: user.email,
  recipientName: user.name ?? undefined,
  verificationUrl: `${frontendBaseUrl}/verify-email?token=${user.verificationToken}`,
  expiresInHours: 24,
  correlationId: `auth-register:${user.id}`,
});
```

### L2 — quiz invitation

```typescript
await this.notifications.sendQuizInvitationEmail({
  recipientEmail: invitee.email,
  recipientName: invitee.name,
  quizTitle: quiz.title,
  invitationUrl: `${frontendBaseUrl}/student/quizzes/${quiz.id}`,
  invitedByName: admin.name ?? 'Quiz Admin',
  correlationId: `quiz-invite:${quiz.id}:${invitee.id}`,
});
```

## Tests

```bash
npm run test -- --testPathPattern=notifications
```

- `test/notifications-foundation.e2e-spec.ts` — templates + Sprint 1 contracts
- `test/notifications-delivery.e2e-spec.ts` — SMTP send, failure, resend (Sprint 2)

## Contract doc

See `docs/api/notifications.md` for the shared API contract consumed by other learners.
