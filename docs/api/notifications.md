# Notifications Contract

## Contract Name

- owner module: `L7 Notifications`
- sprint: `02`
- status: `active`
- last updated: `2026-06-15`

## Purpose

Unified notification service for the whole backend:

- verification emails (L1 Auth)
- quiz invitation emails (L2 / bulk invite flows)
- persisted delivery logs with send/resend lifecycle
- Nodemailer SMTP transport (MailHog in local dev)

Integrity logging moved to the scoring module in Sprint 2. See `src/modules/integrity/`.

## Interface Type

- internal NestJS service (`NotificationService` / `NOTIFICATION_SERVICE` token)
- optional HTTP ops endpoints for delivery-log management

## Service Methods

### `sendVerificationEmail(input)`

**Consumers:** L1 Auth (verify + resend flows)

| Field | Type | Required |
|---|---|---|
| `recipientEmail` | string | yes |
| `recipientName` | string | no |
| `verificationUrl` | string | yes |
| `expiresInHours` | number | no |
| `correlationId` | string | no |
| `metadata` | Json | no |

### `sendQuizInvitationEmail(input)`

**Consumers:** L2 quiz management / bulk invitation flows

| Field | Type | Required |
|---|---|---|
| `recipientEmail` | string | yes |
| `recipientName` | string | no |
| `quizTitle` | string | yes |
| `invitationUrl` | string | yes |
| `invitedByName` | string | no |
| `availableUntil` | Date | no |
| `correlationId` | string | no |
| `metadata` | Json | no |

### `resendDeliveryLog(deliveryLogId)`

Retries a single log that is not already `SENT`.

### `resendFailedDeliveries(input?)`

Batch retries `FAILED` logs. Optional `templateKey` filter and `limit` (default 50).

### `listDeliveryLogs(query?)`

Filter by `status`, `templateKey`, `recipientEmail`. Returns log summaries without rendered bodies.

## Response Shape

All send/resend methods return:

```json
{
  "deliveryLogId": "cuid",
  "status": "SENT",
  "templateKey": "VERIFICATION",
  "subject": "Verify your email address",
  "html": "<html>...</html>",
  "text": "plain text body",
  "errorMessage": null,
  "providerMessageId": "<smtp-message-id>",
  "deliveredAt": "2026-06-15T12:00:00.000Z",
  "attemptCount": 1
}
```

On failure, `status` is `FAILED` and `errorMessage` contains the SMTP error. `deliveredAt` is null.

## HTTP Endpoints (operations)

### `GET /api/notifications/delivery-logs`

Query: `status`, `templateKey`, `recipientEmail`, `limit`

### `POST /api/notifications/delivery-logs/:id/resend`

Retry one log.

### `POST /api/notifications/delivery-logs/resend-failed`

Body: `{ "templateKey"?: "VERIFICATION" | "QUIZ_INVITATION", "limit"?: number }`

Returns:

```json
{
  "attempted": 3,
  "sent": 2,
  "failed": 1,
  "results": [ /* NotificationDispatchResultDto[] */ ]
}
```

## Delivery Log Schema

Table: `email_delivery_logs`

| Field | Notes |
|---|---|
| `recipientEmail` | To address |
| `templateKey` | `VERIFICATION` or `QUIZ_INVITATION` |
| `status` | `PENDING` → `SENT` or `FAILED` |
| `errorMessage` | Set on failure |
| `attemptCount` | Incremented on each send attempt |
| `lastAttemptAt` | Last SMTP attempt timestamp |
| `deliveredAt` | Set when `SENT` |
| `providerMessageId` | Nodemailer message id |
| `metadata.rendered` | Stored HTML/text for resends |

## Validation Rules

- verification emails require `verificationUrl`
- quiz invitations require `quizTitle` and `invitationUrl`
- cannot resend a log already in `SENT` status
- resend requires stored `metadata.rendered` content

## Auth Or Access Rules

Service methods are internal. HTTP ops endpoints are unguarded in Sprint 2 — add admin auth when L1 guards land.

## Side Effects

- Creates/updates `email_delivery_logs` rows
- Sends email via configured SMTP server
- Visible in MailHog during local development (`http://localhost:8025`)

## Dependencies

- `PrismaModule` — delivery log persistence
- `ConfigModule` — SMTP settings (`SMTP_*` env vars)
- Nodemailer — email transport

## Consumer Coordination

| Consumer | Method | When |
|---|---|---|
| L1 Auth | `sendVerificationEmail` | After register, resend verification |
| L2 Quiz | `sendQuizInvitationEmail` | Bulk/single quiz invites |
| Ops / admin | `resendFailedDeliveries` | Recover from SMTP outages |

## Deprecated Aliases

`queueVerificationEmail` and `queueQuizInvitationEmail` remain as aliases to the `send*` methods for Sprint 1 callers.

## Open Questions

- Admin auth on delivery-log HTTP endpoints
- Retry scheduling / background job vs on-demand resend
- Rate limiting for bulk invitation sends
