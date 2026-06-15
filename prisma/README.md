# Prisma Guide

This folder is the single source of truth for the PostgreSQL schema, migrations, and database documentation.

## Files

| File | Purpose |
|---|---|
| `schema.prisma` | Canonical data model used by the NestJS backend |
| `migrations/` | Versioned SQL migrations applied in timestamp order |
| `DATABASE.md` | Full database documentation (tables, relations, enums) |
| `../prisma.config.ts` | Prisma 7 CLI config (schema path, migrations path, datasource URL) |

## Prerequisites

- Node.js 22+
- PostgreSQL 16 (local install or Docker)
- `.env` copied from `.env.example`

## Common Commands

Run these from the repository root:

```bash
# Generate the Prisma client into src/generated/prisma/
npm run prisma:generate

# Format schema.prisma
npm run prisma:format

# Create and apply a migration in local development
npm run prisma:migrate:dev -- --name describe_your_change

# Apply existing migrations (CI, Docker, shared environments)
npm run prisma:migrate:deploy

# Open Prisma Studio (visual DB browser)
npm run prisma:studio

# Seed live-test fixtures (explicit in Prisma 7 — not auto-run on migrate)
npm run db:seed
```

Seed script: `prisma/seed.ts`. Used by live server tests — see `docs/testing/live-server-testing.md`.

## Local Database Setup

### Option A: Docker infrastructure only

```bash
docker compose up -d postgres mailhog
cp .env.example .env
npm install
npm run prisma:migrate:deploy
npm run prisma:generate
npm run start:dev
```

### Option B: Full stack in Docker (database + API + MailHog)

```bash
cp .env.example .env
docker compose up --build
```

The `api` service runs `prisma migrate deploy` on startup, then boots NestJS.

Health check:

- `GET http://localhost:3002/api/health`

MailHog UI:

- `http://localhost:8025`

## Migration Rules (Sprint 2+)

1. Never edit applied migration SQL by hand unless fixing a broken baseline with team approval.
2. Every schema change must include a new folder under `prisma/migrations/`.
3. Coordinate shared schema changes in `docs/api/` before opening a PR.
4. `L3` remains the migration integrator for cross-module schema work.
5. After pulling `main`, always run:

```bash
npm run prisma:migrate:deploy
npm run prisma:generate
```

## Generated Client

Prisma generates TypeScript client code into:

```text
src/generated/prisma/
```

This directory is gitignored. Every developer and CI job must run `npm run prisma:generate` after checkout or schema changes.

## Troubleshooting

| Problem | Fix |
|---|---|
| `Bind for 0.0.0.0:5432 failed: port is already allocated` | Another Postgres is using 5432. Defaults now use host port **5433** — copy `.env.example` to `.env` or set `POSTGRES_PORT=5433`. |
| `Bind for 0.0.0.0:3000 failed` | Another app uses 3000. Default API port is **3002** — set `PORT=3002` in `.env`. |
| TypeScript errors about missing Prisma enums/models | `npm run prisma:generate` |
| `relation does not exist` at runtime | `npm run prisma:migrate:deploy` |
| Stale build output after schema changes | `rm -rf dist && npm run build` |
| Docker API cannot reach Postgres | Ensure `DATABASE_URL` host is `postgres` inside Compose, not `localhost` |

For the full entity reference, see `DATABASE.md`.
