# Notifications Live Testing (L7)

## Sprint 3 invitation walkthrough

The live Sprint 3 spec verifies:

```text
Admin sends quiz invitation
  -> MailHog receives the invitation email
  -> prospective student registers with that email
  -> MailHog receives the verification email
  -> student verifies the account
  -> pending invitation is claimed and the quiz appears for the student
```

Automated coverage is in `test/live/sprint3-window.live-spec.ts`:

```powershell
$env:LIVE_TESTS = "1"
npm run test:live -- test/live/sprint3-window.live-spec.ts
```

**Owner:** Mohamed Waleed (L7)  
**Module:** `src/modules/notifications/`  
**General guide:** `docs/testing/live-server-testing.md`

This document is the feature-specific live testing playbook for SMTP delivery, delivery logs, and resend.

## What static tests already cover

`test/notifications-delivery.e2e-spec.ts` and `test/notifications-foundation.e2e-spec.ts` use **in-process Nest** with mocked Prisma and MailTransport. They prove:

- Template rendering
- Delivery log state transitions (PENDING → SENT / FAILED)
- Resend logic and HTTP DTO mapping

They do **not** prove:

- Nodemailer can reach MailHog over the network
- Docker SMTP env vars (`SMTP_HOST=mailhog`) are correct
- Migrations created `email_delivery_logs` correctly in a real Postgres instance
- HTTP routes work end-to-end through the running API container

## What live tests prove

File: `test/live/notifications.live-spec.ts`

| Step | Validates |
|---|---|
| `GET /api/health` | API container up, migrations applied |
| `GET /api/notifications/delivery-logs?status=FAILED` | Seeded failed log readable over HTTP |
| `POST /api/notifications/delivery-logs/resend-failed` | Real SMTP send + DB status update |
| MailHog API check | Email visible in MailHog for `student@live-test.example` |

## Run it

### Full automated smoke

```bash
# Linux / macOS / Git Bash
bash scripts/run-live-tests.sh
```

```powershell
# Windows PowerShell
.\scripts\run-live-tests.ps1
```

### Manual demo (good for PR screen recording)

```bash
docker compose up -d --build postgres mailhog api
npm run prisma:migrate:deploy
npm run db:seed
LIVE_TESTS=1 npm run test:live
```

Open MailHog UI after the test: `http://localhost:8025` — you should see the resent verification email.

## Seed data used

Created by `prisma/seed.ts`:

| Field | Value |
|---|---|
| Recipient | `student@live-test.example` |
| `correlationId` | `live-test:failed-verification` |
| `status` | `FAILED` (intentionally, for resend test) |
| `metadata.rendered` | HTML + text payload stored for safe resend |

Re-running `npm run db:seed` recreates the failed log (idempotent).

## Manual HTTP checks (curl)

List failed logs:

```bash
curl -s "http://localhost:3002/api/notifications/delivery-logs?status=FAILED" | jq
```

Resend all failed (limit 10):

```bash
curl -s -X POST "http://localhost:3002/api/notifications/delivery-logs/resend-failed" \
  -H "Content-Type: application/json" \
  -d '{"limit":10}' | jq
```

Check MailHog messages:

```bash
curl -s "http://localhost:8025/api/v2/messages" | jq '.items[].Content.Headers.To'
```

## When L1 / L2 wire consumers

After Auth calls `sendVerificationEmail` on register, extend live tests:

1. `POST /api/auth/register` with a new email
2. Assert `email_delivery_logs` row is `SENT`
3. Assert MailHog received the verification message

After quiz invitation APIs land (L2), add:

1. Seed or API call that triggers `sendQuizInvitationEmail`
2. Assert `QUIZ_INVITATION` template in MailHog
3. Assert `correlationId` format `quiz-invite:<quizId>:<userId>`

Add new cases to `test/live/notifications.live-spec.ts` (or `test/live/auth-notifications.live-spec.ts`) and document them here.

## SMTP configuration matrix

| Environment | `SMTP_HOST` | `SMTP_PORT` |
|---|---|---|
| Host `npm run start:dev` | `localhost` | `1025` |
| Docker Compose `api` service | `mailhog` | `1025` |

If live SMTP test fails but static tests pass, compare these values first.

## PR checklist (L7)

- [ ] `npm run test` — static notification specs pass
- [ ] `bash scripts/run-live-tests.sh` or `.\scripts\run-live-tests.ps1` — live notification spec passes
- [ ] MailHog shows resent email after manual resend
- [ ] `docs/api/notifications.md` updated if HTTP contract changed
- [ ] Consumer examples in `src/modules/notifications/README.md` still accurate

## Troubleshooting (notifications-specific)

| Symptom | Check |
|---|---|
| Resend returns `sent: 0` | Seed ran? `correlationId=live-test:failed-verification` present? |
| SMTP connection refused | MailHog running? `docker compose ps mailhog` |
| API sees MailHog but host tests don't | Host uses `localhost:1025`; container uses `mailhog:1025` — live tests hit the **API container**, which is correct |
| `metadata.rendered` missing on resend | Seed must include `metadata.rendered.html` and `.text` |
