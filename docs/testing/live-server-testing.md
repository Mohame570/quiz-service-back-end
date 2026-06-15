# Live Server Testing Guide

This document explains how to validate features against a **real running stack** — Postgres, MailHog, and the NestJS API — instead of only running in-process Jest tests with mocks.

## Two testing layers

| Layer | What it proves | When to run |
|---|---|---|
| **Static / in-process** (`test/*.e2e-spec.ts`) | Module wiring, DTO validation, service logic with mocks | Every commit / PR (`npm run test`) |
| **Live / dynamic** (`test/live/*.live-spec.ts`) | Migrations, env config, SMTP, real HTTP, seeded DB state | Before merge, after Docker or infra changes |

Both are required for features that touch external systems (database, SMTP, file storage).

## Prerequisites

- Docker Desktop (Windows/macOS) or Docker Engine (Linux)
- Node.js 22+ and `npm install` completed
- `.env` copied from `.env.example`

### Windows notes

Docker runs **Linux containers**, so `docker/entrypoint.sh` executes inside Linux — not in PowerShell. You do **not** need Git Bash to run the API container.

What we fixed for Windows contributors:

1. **`.gitattributes`** — shell scripts are checked out with LF line endings (CRLF breaks `#!/bin/sh`).
2. **`Dockerfile`** — strips any stray `\r` during build and uses `ENTRYPOINT ["/bin/sh", "docker/entrypoint.sh"]` so the script does not depend on the shebang + execute bit alone.
3. **`scripts/run-live-tests.ps1`** — PowerShell entry point equivalent to the bash script.

Recommended on Windows: **Docker Desktop with WSL2 backend** enabled.

## Quick smoke (one command)

### Linux / macOS / Git Bash

```bash
bash scripts/run-live-tests.sh
```

### Windows PowerShell

```powershell
.\scripts\run-live-tests.ps1
```

This script:

1. Builds and starts `postgres`, `mailhog`, and `api` via Docker Compose
2. Waits until `GET /api/health` succeeds
3. Runs `npm run prisma:migrate:deploy`
4. Seeds the database (`npm run db:seed`)
5. Runs live tests (`LIVE_TESTS=1 npm run test:live`)

## Manual workflow (step by step)

Use this when debugging a failing live test.

```bash
# 1. Start infrastructure
docker compose up -d --build postgres mailhog api

# 2. Wait for API (optional helper)
bash scripts/wait-for-api.sh
# Windows: .\scripts\wait-for-api.ps1

# 3. Migrate + seed from the host (same DB as the container)
npm run prisma:migrate:deploy
npm run db:seed

# 4. Run live tests only
LIVE_TESTS=1 npm run test:live
```

Verify manually:

- API health: `http://localhost:3002/api/health`
- MailHog UI: `http://localhost:8025`

## Seeding

Seed script: `prisma/seed.ts`  
Command: `npm run db:seed` (wraps `npx prisma db seed`)

Seeding is **explicit** in Prisma 7 — it does not run automatically on `migrate dev`. Live tests assume seed data exists.

### Seed conventions

- Use stable emails like `admin@live-test.example` so tests and docs stay predictable.
- Use `correlationId` values prefixed with `live-test:` for rows live tests query.
- Make seeds **idempotent** (`upsert` / delete-then-create for test fixtures).
- Document new seed rows in your feature's live-testing doc.

Default seed creates:

| Entity | Purpose |
|---|---|
| Admin + student users | Auth smoke tests (future) |
| Published quiz | Student/quiz integration (future) |
| Failed `email_delivery_logs` row | L7 notifications resend smoke test |

## Writing a live test

1. Add `test/live/<feature>.live-spec.ts`
2. Gate with `process.env.LIVE_TESTS === '1'` so CI/default `npm run test` stays fast:

```typescript
const runLive = process.env.LIVE_TESTS === '1';

(runLive ? describe : describe.skip)('Live server — my feature', () => {
  beforeAll(async () => {
    await waitForApi();
  }, 90_000);

  it('hits the real API', async () => {
    const response = await fetch(`${LIVE_API_BASE_URL}/health`);
    expect(response.status).toBe(200);
  });
});
```

3. Use `fetch` against `LIVE_API_BASE_URL` (helpers in `test/live/helpers/live-client.ts`).
4. Assert side effects in external systems when relevant (e.g. MailHog API for email).
5. Document the scenario in `docs/testing/<module>-live-testing.md`.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `LIVE_TESTS` | unset | Set to `1` to enable live specs |
| `LIVE_API_ORIGIN` | `http://localhost:3002` | API host |
| `API_PREFIX` | `api` | Global prefix |
| `LIVE_MAILHOG_API_URL` | `http://localhost:8025/api/v2` | MailHog REST API |
| `DATABASE_URL` | from `.env` | Host migrations + seed |

## PR checklist (live testing)

- [ ] `npm run test` passes (static/in-process)
- [ ] `bash scripts/run-live-tests.sh` **or** `.\scripts\run-live-tests.ps1` passes
- [ ] Seed updated if live test needs new fixtures
- [ ] `docs/testing/<module>-live-testing.md` updated for your feature
- [ ] Docker/entrypoint changes tested on Windows if you touched `docker/` or `Dockerfile`

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `exec ... entrypoint.sh: no such file or directory` | CRLF line endings | `git add --renormalize docker/entrypoint.sh`, rebuild image |
| Port already in use | Another Postgres/API on 5433/3002 | Change `POSTGRES_PORT` / `PORT` in `.env` |
| Live tests skipped | `LIVE_TESTS` not set | `LIVE_TESTS=1 npm run test:live` |
| MailHog assertion fails | Old messages in inbox | Live suite purges MailHog in `beforeAll`; restart MailHog if needed |
| Seed fails on quiz id | Migration not applied | `npm run prisma:migrate:deploy` |

## Related docs

- `docs/testing/notifications-live-testing.md` — L7 notifications walkthrough
- `CONTRIBUTING.md` — branch workflow and quality gates
- `prisma/README.md` — migrations and Prisma CLI
