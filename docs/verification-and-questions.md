# Verification and Question Metadata — Technical Handover

## 1. Verification Flow

### Overview
Email verification ensures the student entry path is reliable. On registration, a 24h token is generated and emailed via `NotificationService → MailTransportService (nodemailer → MailHog/SMTP)`. The user clicks `FRONTEND_BASE_URL/verify-email?token=...` which hits `POST /api/auth/verify-email`.

```
Register → create verificationToken + expiresAt + lastVerificationSentAt → sendVerificationEmail(verificationUrl) → User clicks link → verifyEmail(token) → mark emailVerified
```

### Key Code
- `src/modules/auth/services/auth.service.ts` — `buildVerificationUrl(token)`, `getVerificationTokenExpiresAt()`, `getResendCooldownSeconds()`, `register()`, `verifyEmail()`, `resendVerification()`
- `src/modules/notifications/templates/verification-email.template.ts` — renders HTML/text with safe URL escaping
- `src/modules/notifications/services/notification.service.ts` — `sendVerificationEmail()`, `dispatchEmail()` → `mailTransport.sendMail()`
- `src/modules/notifications/services/mail-transport.service.ts` — `nodemailer.createTransport({host, port, auth})`

### Env-Driven Base URL
`buildVerificationUrl()` centralizes link generation:

```ts
private buildVerificationUrl(token: string): string {
  const baseUrl = (config.get('frontend.baseUrl') ?? config.get('FRONTEND_BASE_URL') ?? 'http://localhost:3000').replace(/\/+$/, '');
  return `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;
}
```

- `src/common/config/configuration.ts: frontend.baseUrl = FRONTEND_BASE_URL ?? http://localhost:3000`
- `src/common/config/env.validation.ts: FRONTEND_BASE_URL = Joi.string().uri().default('http://localhost:3000')`
- `.env.example: FRONTEND_BASE_URL=http://localhost:3000`

No hard-coded URL remains. Tests assert `verificationUrl` contains `FRONTEND_BASE_URL`.

---

## 2. Resend Cooldown Rate-Limiting

### Backend Throttling
`resendVerification()` enforces a per-user cooldown to prevent abuse.

- **Config**: `VERIFICATION_RESEND_COOLDOWN_SECONDS` (default `60`, range `10..3600`) and `VERIFICATION_TOKEN_EXPIRES_HOURS` (default `24`)
- **DB field**: `User.lastVerificationSentAt DateTime? @map("last_verification_sent_at")` — set on `register()` and on each `resendVerification()` success
- **Logic**:
  ```ts
  const elapsed = Date.now() - lastVerificationSentAt.getTime();
  const remaining = cooldownSeconds*1000 - elapsed;
  if (remaining > 0) throw new HttpException({ message, retryAfter, cooldownSeconds }, 429);
  ```
- **HTTP**: `429 TOO_MANY_REQUESTS` with JSON `{ message, retryAfter, cooldownSeconds }`. Frontend can read `retryAfter` for countdown.
- **Migration**: `20260902222931_add_verification_cooldown_and_question_metadata` adds `last_verification_sent_at`

### Frontend Countdown
- `components/verification/VerifyEmailClient.tsx` — holds `cooldown` state (seconds), `setInterval` decrements every 1s
- On success: `setCooldown(retryAfter ?? 60)`
- On 429: `setCooldown(body.retryAfter)` + error message `Please wait Xs...`
- Button: disabled while `cooldown > 0 || sending`, label shows `Retry in Ns` and helper text `Cooldown active...`

### Testing
- `src/modules/auth/services/auth.service.spec.ts` — covers:
  - `enforces cooldown and throws 429 if resend too soon`
  - `allows resend after cooldown expires`
  - `updates lastVerificationSentAt on resend`
  - `builds verification URL using FRONTEND_BASE_URL`

Run: `npm run test:unit` or `npm run test`

---

## 3. Question Metadata Schema

### Prisma Schema (`prisma/schema.prisma`)
```prisma
enum Difficulty { EASY MEDIUM HARD }

model Question {
  id            String       @id @default(cuid())
  type          QuestionType
  text          String
  options       String[]
  correctAnswer String
  points        Int          @default(1)
  difficulty    Difficulty   @default(MEDIUM)
  topic         String?
  tags          String[]     @default([])
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
}
```

- `difficulty` enables filtering by Easy/Medium/Hard
- `topic` is the primary grouping (e.g., `JavaScript`, `Databases`, `Algorithms`)
- `tags` is a PostgreSQL `TEXT[]` array for flexible sub-topics (e.g., `['javascript','event-loop']`), with `hasSome` filtering

### DTOs
- `src/modules/questions/dto/create-question.dto.ts` — adds `difficulty?: Difficulty`, `topic?: string`, `tags?: string[]` (validated: `@IsEnum(Difficulty)`, `@IsString`, `@ArrayUnique`)
- `src/modules/questions/dto/update-question.dto.ts` — same optional fields
- `src/modules/questions/services/questions.service.ts` — `createQuestion()` now persists `difficulty/topic/tags`; `getQuestions() / findAllUnassigned() / findByQuiz()` accept `filter: { difficulty?, topic?, tags? }` and translate to `where: { difficulty, topic, tags: { hasSome: tags } }`
- `src/modules/questions/controllers/questions.controller.ts` — `GET /questions?difficulty=EASY&topic=JavaScript&tags=js,basics`

### Migration
`20260902222931_add_verification_cooldown_and_question_metadata`:
```sql
CREATE TYPE "Difficulty" AS ENUM ('EASY','MEDIUM','HARD');
ALTER TABLE "questions" ADD COLUMN "difficulty" "Difficulty" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "topic" TEXT;
ALTER TABLE "users" ADD COLUMN "last_verification_sent_at" TIMESTAMP(3);
```

Run:
```bash
npx prisma migrate deploy
npx prisma generate
```

### Seed Data (`prisma/seed.ts`)
- `seedQuestionMetadataBank()` creates **12 tagged questions** covering all `Difficulty` × `Topic` combos (JavaScript, Databases, Algorithms, Web, Geography) with realistic `tags`
- Enriches `new-quiz-1` questions and live-test fixtures with `difficulty/topic/tags`
- Prints distribution after seeding: `Difficulty distribution: EASY:4, MEDIUM:5, HARD:3` and `Topics: JavaScript, Databases...`

Example seeded rows:
- `What does "use strict" do? — difficulty EASY — topic JavaScript — tags [javascript, basics, syntax]`
- `Design a schema for quiz platform — difficulty HARD — topic Databases — tags [databases, schema-design, essay]`

---

## 4. Environment Variables

| Variable | Purpose | Default | Docs |
|---|---|---|---|
| `FRONTEND_BASE_URL` | Base URL for verification links | `http://localhost:3000` | `.env.example` |
| `FRONTEND_ALLOWED_ORIGINS` | CORS | `http://localhost:3001,http://localhost:3000` | |
| `VERIFICATION_RESEND_COOLDOWN_SECONDS` | Cooldown throttling | `60` | `.env.example` |
| `VERIFICATION_TOKEN_EXPIRES_HOURS` | Token TTL | `24` | |
| `DATABASE_URL` | Postgres connection | `postgresql://postgres:postgres@localhost:5433/quiz_service` | |
| `SMTP_HOST/PORT/USERNAME/PASSWORD/FROM_EMAIL` | MailHog/SMTP (verification) | `localhost:1025 / no-reply@example.com` | MailHog at `http://localhost:8025` |
| `JWT_SECRET` | JWT signing | `change-me...` | |
| `JWT_ACCESS_TOKEN_EXPIRES_IN` | JWT TTL | `1h` | |

All validated in `src/common/config/env.validation.ts` (Joi). Missing/invalid vars fail fast on boot.

### SMTP / MailHog
- Dev: `SMTP_HOST=localhost SMTP_PORT=1025` → MailHog. View emails at `http://localhost:8025`.
- `MailTransportService` uses `nodemailer.createTransport({host, port, secure: port===465, auth?, tls:{rejectUnauthorized:false}})`.
- `NotificationService.dispatchEmail()` logs `EmailDeliveryLog` with `status PENDING→SENT/FAILED`, preserves `rendered.html/text` in `metadata`.

---

## 5. Testing & Verification

```bash
npm run build
npm run test:unit   # auth.service.spec.ts covers verification + cooldown
npm run test        # e2e
npx prisma migrate deploy
npx prisma db seed
curl http://localhost:3002/api/health
curl -X POST http://localhost:3002/api/auth/register -H "Content-Type: application/json" -d '{"name":"A","email":"a@ex.com","password":"Password123!"}'
curl -X POST http://localhost:3002/api/auth/resend-verification -H "Content-Type: application/json" -d '{"email":"a@ex.com"}' # first 200, second immediate 429
```

Frontend manual:
1. Register → check MailHog for `Verify your email` → click link → `Email verified`
2. On invalid link, enter email → `Resend email` → button shows `Retry in 60s` and is disabled

---

## 6. PR Checklist (for QNA-050101)
- [x] `src/modules/auth` uses env-driven `FRONTEND_BASE_URL`
- [x] `resendVerification` cooldown with `429 + retryAfter`
- [x] `VerificationClient` countdown UI
- [x] `prisma/schema.prisma` has `Difficulty`, `topic`, `tags`, `lastVerificationSentAt`
- [x] Migration `20260902222931...` runs cleanly
- [x] Seed: 12 tagged questions + enriched existing
- [x] Tests: verification + cooldown
- [x] Docs: this file + `.env.example` updated
