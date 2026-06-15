# Contributing Guide

This document defines how contributors build features in this backend repository so work merges cleanly across the team.

**Stack:** NestJS, PostgreSQL, Prisma  
**Current sprint:** Sprint 2 (`02` in branch names)

## Core Rules

- Start every feature from the latest `main`.
- Work mainly in your owned module folder.
- Keep feature logic out of `src/common/` unless the code is truly shared infrastructure.
- Do not commit `node_modules/`, `dist/`, `src/generated/prisma/`, or `.env`.
- Document shared API and schema changes before requesting merge.
- After pulling `main`, run `npm run prisma:migrate:deploy && npm run prisma:generate`.

## Branch Naming

Format:

```text
QNA-L#xx-feature-name
```

- `L#` = learner number (`L1` … `L7`)
- `xx` = 2-digit sprint number (`01`, `02`, …)
- `feature-name` = short kebab-case description

### Sprint 2 examples

| Learner | Branch example |
|---|---|
| L1 | `QNA-L102-email-verification-flow` |
| L2 | `QNA-L202-quiz-publish-settings` |
| L3 | `QNA-L302-question-bank-validation` |
| L4 | `QNA-L402-student-quiz-solving` |
| L5 | `QNA-L502-auto-scoring-integrity` |
| L6 | `QNA-L602-admin-analytics-dashboard` |
| L7 | `QNA-L702-notification-smtp-delivery` |

Rules:

- Branch from updated `main`.
- Lowercase kebab-case only.
- One branch per logical feature.
- Do not reuse old Sprint 1 branches for Sprint 2 work.

```bash
git checkout main
git pull origin main
git checkout -b QNA-L702-notification-smtp-delivery
```

## Module Ownership

| Learner | Path | Sprint 2 focus |
|---|---|---|
| L1 | `src/modules/auth/` | Verify email, resend, route guards |
| L2 | `src/modules/quiz/` | Publish/unpublish, settings, assignment |
| L3 | `src/modules/questions/` | Question bank CRUD, publish validation gate |
| L4 | `src/modules/student/` | Solving flow + frontend integration |
| L5 | `src/modules/attempts/` | Auto-scoring, integrity event capture |
| L6 | `src/modules/analytics/` | Real metrics dashboard APIs |
| L7 | `src/modules/notifications/` | SMTP transport, delivery logs, resend |
| L7 | `src/modules/integrity/` | Cheating log writes (with L5) |

### Recommended module layout

```text
src/modules/<module>/
├── <module>.module.ts
├── controllers/
├── services/
├── dto/
├── guards/          # when needed
├── templates/       # notifications only
└── *.spec.ts        # unit tests near code
```

E2E / whole-app tests belong in `test/`.

## Shared Areas

Edit carefully — request review from affected owners:

| Path | When you may edit |
|---|---|
| `src/common/` | Shared infra used by multiple modules |
| `src/app.module.ts` | Wiring a new or updated module |
| `prisma/schema.prisma` | Agreed schema changes only |
| `prisma/migrations/` | Matching reviewed migrations |
| `docs/api/` | Contract updates |
| `README.md`, `CONTRIBUTING.md` | Process/structure changes |
| `docker-compose.yml`, `Dockerfile` | DevOps changes with team notice |

**Migration integrator:** `L3` coordinates cross-module schema PRs.

## Feature Workflow

1. Pull latest `main`.
2. Create branch (`QNA-L#02-...`).
3. Implement in your module.
4. Update `docs/api/<your-module>.md`.
5. If schema changed: coordinate with `L3`, add migration, run `prisma:generate`.
6. Run quality gates (below).
7. Open PR to `main`.
8. Tag affected module owners.
9. Merge after approval.

## API Documentation

One contract file per area in `docs/api/`:

- `auth.md`, `quiz.md`, `questions.md`, `student.md`, `attempts.md`, `notifications.md`

Use `docs/api/_template.md` for new contracts.

Each doc should cover: endpoint, owner, request/response, auth, validation, dependencies, side effects, open questions.

Breaking changes must be announced in the PR and tagged to consumers **before** merge.

## Database Changes

All schema work goes through Prisma:

1. Discuss the change in `docs/api/` or PR description.
2. Coordinate with `L3` for shared models.
3. Edit `prisma/schema.prisma` on your branch.
4. Run `npm run prisma:format` and `npm run prisma:migrate:dev -- --name describe_change`.
5. Update `prisma/DATABASE.md` if tables/relations change materially.
6. Run `npm run prisma:generate`.
7. Document impact in the PR.

Never hand-edit `src/generated/prisma/`.

## Frontend Coordination

The frontend is a separate repo. When your API change affects UI:

- Update the matching `docs/api/` file.
- Note the change in `docs/frontend-integration.md` if it affects CORS, auth, or base URL setup.
- Tag the frontend owner in the PR.

## Pull Request Checklist

- [ ] Branch name follows `QNA-L#xx-feature-name`
- [ ] Scope is focused (no unrelated changes)
- [ ] Code in correct module folder
- [ ] `docs/api/` updated
- [ ] Migration included if schema changed
- [ ] `npm run prisma:generate && npm run build && npm run test` pass
- [ ] Live smoke passes when feature touches DB/SMTP/Docker (`bash scripts/run-live-tests.sh` or `.\scripts\run-live-tests.ps1`)
- [ ] Affected owners tagged

### Reviewers

- Your module reviewer / mentor
- `L3` if `prisma/` changed
- Any module owner affected by a shared contract change

### PR title examples

- `L1 S02: add verify-email and resend endpoints`
- `L5 S02: auto-score submitted attempts`
- `L7 S02: wire SMTP delivery to notification service`

## Quality Gates

```bash
npm run prisma:generate
npm run build
npm run lint
npm run test
```

With schema changes also run:

```bash
npm run prisma:format
npm run prisma:migrate:deploy   # verify migrations apply cleanly
```

### Live server validation (before merge)

Static `npm run test` uses in-process Nest with mocks. Features that touch Postgres, SMTP, or Docker must also pass live tests:

```bash
# Linux / macOS / Git Bash
bash scripts/run-live-tests.sh

# Windows PowerShell
.\scripts\run-live-tests.ps1

# Or via Make (Unix)
make stack-smoke
```

See `docs/testing/live-server-testing.md` for the full contributor guide. Module owners add `docs/testing/<module>-live-testing.md` for their feature (example: `docs/testing/notifications-live-testing.md` for L7).

## Docker / Local Environment

- **DB + MailHog only:** `make db-up` then `npm run start:dev`
- **Full stack:** `make stack-up` (see `README.md`)
- **Live smoke tests:** `make stack-smoke` or `bash scripts/run-live-tests.sh` (Windows: `.\scripts\run-live-tests.ps1`)

Ensure `.env` exists (copy from `.env.example`).

### Windows + Docker

The API container runs `docker/entrypoint.sh` **inside Linux** — you do not run that script in PowerShell. We enforce LF line endings (`.gitattributes`) and normalize CRLF in the `Dockerfile` so `docker compose up --build` works on Windows with Docker Desktop (WSL2 backend recommended).

## What Must Never Be Committed

- `node_modules/`, `dist/`, `src/generated/prisma/`, `.env`
- Database dumps, local logs, editor-specific files

## Clean Merge Tips

- Rebase or merge `main` before opening PR if the base moved.
- Keep PRs small.
- Do not mix schema refactors with unrelated feature work.
- Use a temporary integration branch to test multiple in-flight features — do not use `main` for that.

## Sprint 2 Coordination

Per-learner deliverables are in `misc/sprint2.txt`. Each owner ships backend work here plus matching frontend screens in the separate frontend repo.

**Learner 8 (bulk invitations) is no longer on the project.** That scope will be reassigned — likely **L2** (assignment/invite APIs) and **L7** (email transport).

| Dependency | Owner | Consumers |
|---|---|---|
| Email verification + JWT guards | L1 | L4 solving, protected routes |
| SMTP notification service | L7 | L1 verification, future invites |
| Question publish validation gate | L3 | L2 publish API |
| Auto-scoring + integrity capture | L5 | L4 solving UI, L6 analytics |
| Quiz student assignment | L2 (from L8) | L4 student quiz list |

