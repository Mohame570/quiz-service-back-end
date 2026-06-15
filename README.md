# Quiz Service Backend

Backend for the internship quiz platform.

- **Stack:** NestJS, PostgreSQL, Prisma, TypeScript
- **Branch model:** `main` holds the integrated Sprint 1 codebase; Sprint 2 features ship via learner PRs
- **Frontend:** separate repository — see `docs/frontend-integration.md`

For feature workflow and branch naming, see `CONTRIBUTING.md`.

## Locked Technical Direction

| Layer | Choice |
|---|---|
| Framework | NestJS 11 |
| Runtime | Node.js 22+ |
| Database | PostgreSQL 16 |
| ORM | Prisma 7 |
| Testing | Jest + Supertest |
| Local infra | Docker Compose (Postgres, MailHog, optional API container) |

## Sprint Status

### Sprint 1 — merged on `main`

| Learner | Area | Status on `main` |
|---|---|---|
| L1 | Auth (register/login/JWT, roles) | Foundation done; verification flow deferred to Sprint 2 |
| L2 | Quiz CRUD + draft/published | Done |
| L3 | Questions + migrations | Done |
| L4 | Student quiz entry flow | Done (module wired, assignment filter active) |
| L5 | Attempt data model | Done |
| L6 | Analytics contracts + endpoints | Done |
| L7 | Notifications + integrity models | Foundation done; real email transport in Sprint 2 |

### Sprint 1 gaps intentionally left for Sprint 2

- Email verification endpoints and route guards (L1)
- Real JWT guards on student/attempt routes (currently stubbed for local testing)
- Quiz publish validation gate and assignment/invite APIs (L2)
- Auto-scoring and integrity event capture during solving (L5)
- Live SMTP delivery through notification service (L7)
- Frontend UI (separate repo)

**Verdict:** `main` is ready as the Sprint 2 integration base. Owners should branch from `main` using `QNA-L#02-feature-name`.

> **Note:** Learner 8 (bulk invitations) is no longer on the project. That scope will be picked up by other owners — likely **L2** (quiz/assignment APIs) and **L7** (notification transport). See `misc/sprint2.txt` for per-learner deliverables.

## Quick Start

### Full stack with Docker (database + API + MailHog)

```bash
cp .env.example .env
docker compose up --build
```

- API: `http://localhost:3002/api/health` (default `PORT=3002` — see `.env.example`)
- MailHog: `http://localhost:8025`

Migrations run automatically when the `api` container starts.

### Local development (hot reload)

```bash
nvm use
npm install
cp .env.example .env
docker compose up -d postgres mailhog
npm run prisma:migrate:deploy
npm run prisma:generate
npm run start:dev
```

### Verify

```bash
npm run build
npm run test
curl http://localhost:3002/api/health
```

### Live server smoke (real Postgres + MailHog + API)

```bash
bash scripts/run-live-tests.sh          # Linux / macOS / Git Bash
# .\scripts\run-live-tests.ps1          # Windows PowerShell
```

See `docs/testing/live-server-testing.md`.

## Environment Variables

See `.env.example`. Key values:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` / `API_PREFIX` | API listen port and prefix (`3002` / `api` by default) |
| `FRONTEND_BASE_URL` | CORS origin for the Next.js app |
| `JWT_SECRET` | JWT signing secret |
| `SMTP_*` | MailHog/SMTP for email (Sprint 2) |

Inside Docker Compose, the API uses `postgres` as the database host. On the host machine, use `localhost`.

## Documentation Map

| Document | Contents |
|---|---|
| `CONTRIBUTING.md` | Branch naming, PR rules, module ownership |
| `docs/testing/live-server-testing.md` | Live stack + seed + dynamic test guide |
| `prisma/README.md` | Prisma CLI, migrations, troubleshooting |
| `prisma/DATABASE.md` | Full schema, tables, relations, ER diagram |
| `docs/frontend-integration.md` | Connecting the Next.js frontend to this API |
| `docs/api/` | Per-module API contracts |
| `src/modules/README.md` | Module layout conventions |

## Project Layout

```text
.
├── docker-compose.yml      # Postgres, MailHog, API
├── Dockerfile              # Production-style API image
├── docker/entrypoint.sh      # migrate deploy + start
├── prisma/
│   ├── schema.prisma       # Canonical data model
│   ├── migrations/         # Versioned SQL migrations
│   ├── README.md           # Prisma usage guide
│   └── DATABASE.md         # Full database documentation
├── docs/
│   ├── api/                # API contracts per module
│   └── frontend-integration.md
├── src/
│   ├── common/             # Shared config + Prisma
│   ├── health/             # Health endpoint
│   ├── modules/            # Feature modules (L1–L7)
│   ├── app.module.ts
│   └── main.ts
└── test/                   # E2E tests
```

## Module Ownership (Sprint 2)

| Learner | Folder | Sprint 2 focus |
|---|---|---|
| L1 | `src/modules/auth/` | Email verification + route protection |
| L2 | `src/modules/quiz/` | Publish/unpublish, settings, assignment |
| L3 | `src/modules/questions/` | Question bank CRUD + publish validation gate |
| L4 | `src/modules/student/` | Solving flow integration with frontend |
| L5 | `src/modules/attempts/` | Auto-scoring + integrity event capture |
| L6 | `src/modules/analytics/` | Real dashboard metrics |
| L7 | `src/modules/notifications/` | SMTP delivery + resend failed |

## Common Commands

```bash
npm run start:dev          # Dev server with watch
npm run build              # Compile
npm run test               # E2E test suite
npm run prisma:generate    # Regenerate Prisma client
npm run prisma:migrate:dev # Create migration (coordinate with L3)
npm run prisma:migrate:deploy
npm run prisma:studio      # DB browser

make db-up                 # Postgres + MailHog only
make stack-up              # Full Docker stack
make stack-down
make stack-smoke           # Docker up + seed + live tests
make db-seed               # Populate live-test fixtures
npm run test:live          # Live specs (set LIVE_TESTS=1)
```

## Database Rules

- All schema changes go through `prisma/schema.prisma` + a new migration folder
- `L3` coordinates shared schema PRs
- After every `git pull` on `main`:

```bash
npm run prisma:migrate:deploy
npm run prisma:generate
```

## API Surface (Sprint 1)

| Prefix | Module |
|---|---|
| `GET /api/health` | Health |
| `POST /api/auth/register`, `/login` | Auth |
| `/api/quizzes` | Quiz admin |
| `/api/questions` | Questions |
| `/api/student/*` | Student flow |
| `/api/attempts` | Attempts |
| `/api/analytics` | Analytics |

Details in `docs/api/`.

## Team Rules

- Backend-only repo — no frontend code here
- One learner per module folder; coordinate shared schema changes
- Document API changes in `docs/api/` before requesting merge
- Use temporary integration branches when multiple unfinished features must be tested together
