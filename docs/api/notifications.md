# Notifications Contract

## Contract Name

- owner module: `L7 Notifications / Integrity`
- sprint: `01`
- status: `foundation`
- last updated: `2026-06-09`

## Purpose

This contract defines the shared notification foundation for Sprint 1:

- one shared service for verification and quiz invitation emails
- reusable email templates
- persisted email delivery logs
- persisted cheating event logs

This is intentionally limited to module contracts and persistence foundations. It does not introduce HTTP endpoints in Sprint 1.

## Interface Type

- internal service
- database contract

## Request Or Input

### Notification service methods

`queueVerificationEmail(input)`

Input fields:

- `recipientEmail: string`
- `recipientName?: string`
- `verificationUrl: string`
- `expiresInHours?: number`
- `correlationId?: string`
- `metadata?: Json`

`queueQuizInvitationEmail(input)`

Input fields:

- `recipientEmail: string`
- `recipientName?: string`
- `quizTitle: string`
- `invitationUrl: string`
- `invitedByName?: string`
- `availableUntil?: Date`
- `correlationId?: string`
- `metadata?: Json`

### Integrity service method

`recordCheatingEvent(input)`

Input fields:

- `attemptId: string`
- `eventType: CheatingEventType`
- `description?: string`
- `occurredAt?: Date`
- `metadata?: Json`

## Response Or Output

### Notification service output

Both notification methods return:

- `deliveryLogId`
- `status`
- `templateKey`
- `subject`
- `html`
- `text`

The current Sprint 1 behavior is to:

- render the template
- create an `email_delivery_logs` row
- return the rendered payload and log reference

It does not yet integrate a real mail provider in this branch.

### Integrity service output

The integrity service returns the created `cheating_event_logs` row.

## Validation Rules

- verification emails require a `verificationUrl`
- quiz invitation emails require both `quizTitle` and `invitationUrl`
- cheating events require an `attemptId` and `eventType`
- delivery logs default to `PENDING` status until an actual send attempt is integrated

## Auth Or Access Rules

No public HTTP access is defined in Sprint 1.

These services are intended to be consumed internally by backend modules such as:

- Auth
- Quiz
- Student
- Scoring

## Side Effects

- notification methods create an `email_delivery_logs` record
- integrity logging creates a `cheating_event_logs` record
- templates generate both HTML and text output for reuse across flows

## Dependencies

- `L1 Auth` will later consume verification email flow
- `L2 Quiz` will later consume quiz invitation flow
- `L4 Student` and `L5 Attempts` will later consume integrity event logging
- `L3` must review final schema alignment before merge if shared Prisma migration ordering changes

## Coordination Notes

- `email_delivery_logs` intentionally stores `recipientEmail`, `templateKey`, and `correlationId` without assuming a relation to the future `User` model
- `cheating_event_logs` intentionally stores `attemptId` as a scalar string for now to avoid assuming the final `Attempt` model ID type before `L5` and `L3` finalize it
- once `L5` finalizes the attempt contract, this field can be reviewed for relation alignment if needed

## Open Questions

- final mail provider integration point
- retry policy ownership and scheduling strategy
- whether `attemptId` remains a scalar reference or becomes a strict Prisma relation after `L5` lands
