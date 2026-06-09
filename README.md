# Quiz Service Backend

This repository is the backend-only foundation for the internship quiz platform.
The backend stack is now locked to `NestJS + PostgreSQL + Prisma`.

For Sprint 1, `main` must stay a shared foundation branch only. It should contain the project structure, tooling, conventions, and minimal app shell, but not anyone's feature implementation.

For the day-to-day feature workflow, branch naming, PR rules, and documentation process, see `CONTRIBUTING.md`.

## Locked Technical Direction

- Framework: `NestJS`
- Runtime: `Node.js 22+`
- Language: `TypeScript`
- Database: `PostgreSQL`
- ORM / schema / migrations: `Prisma`
- Testing: `Jest` + `Supertest`
- Local infra: `Docker Compose`
- Email dev helper: `MailHog`

## Main Branch Contract

### Safe on `main`

- shared backend repo structure
- NestJS application bootstrap
- shared config and environment validation
- shared Prisma service and schema location
- empty module folders for team ownership
- shared docs and API contract area
- local dev tooling such as `docker-compose.yml`, `.env.example`, and `Makefile`
- a minimal health endpoint

### Must stay off `main`

- real feature controllers, services, DTOs, guards, or business logic
- Prisma models for users, quizzes, questions, attempts, notifications, or integrity logs
- Prisma migrations and generated shared data contracts owned by `L3`
- Auth, Quiz, Student, Attempts, Analytics, or Notify implementation work
- cross-module integration wiring that belongs to Sprint 1 feature owners

## Sprint 1 Dependency Rules

- `L3` is the biggest technical blocker because Prisma schema design and migrations affect the whole backend.
- `L5` defines the attempt contract that `L6` analytics depends on.
- `L7` owns notifications and integrity logging, but full integration into other modules should not be forced onto `main`.
- `L4` can move in parallel, but it still depends on stable backend contracts from `L1` and `L2`.

## Recommended Team Workflow

1. Keep this scaffold on `main`.
2. Every owner branches from `main`.
3. Nominate the `L3` owner as the Prisma migration integrator.
4. Any PR that changes a shared contract must document that contract in `docs/api/` or in the PR description.
5. If multiple unfinished branches must be tested together later, create a temporary integration branch instead of bloating `main`.

## Canonical Project Layout

```text
.
├── .editorconfig
├── .env.example
├── .gitignore
├── .nvmrc
├── .prettierrc
├── README.md
├── docker-compose.yml
├── eslint.config.mjs
├── Makefile
├── nest-cli.json
├── package-lock.json
├── package.json
├── prisma.config.ts
├── prisma/
│   └── schema.prisma
├── docs/
│   └── api/
│       └── .gitkeep
├── src/
│   ├── app.module.ts
│   ├── main.ts
│   ├── common/
│   │   ├── config/
│   │   │   ├── configuration.ts
│   │   │   └── env.validation.ts
│   │   └── prisma/
│   │       ├── prisma.module.ts
│   │       └── prisma.service.ts
│   ├── health/
│   │   ├── health.controller.ts
│   │   └── health.module.ts
│   └── modules/
│       ├── README.md
│       ├── analytics/
│       ├── attempts/
│       ├── auth/
│       ├── integrity/
│       ├── notifications/
│       ├── questions/
│       ├── quiz/
│       └── student/
├── test/
│   ├── health.e2e-spec.ts
│   └── jest-e2e.json
├── tsconfig.build.json
└── tsconfig.json
```

## File And Folder Roles

This section is the source of truth for what goes where.

### Root files

- `README.md`: the team contract for structure, ownership boundaries, and local setup.
- `.gitignore`: ignores local-only files and build output.
- `.env.example`: the shared list of backend environment variables.
- `.nvmrc`: recommended Node version for the team.
- `.editorconfig`: shared editor whitespace rules.
- `.prettierrc`: shared formatting rules for TypeScript code.
- `package.json`: dependency list, scripts, engines, and package metadata.
- `package-lock.json`: npm lockfile so the team installs the same dependency graph.
- `nest-cli.json`: tells Nest CLI where the source root is and how to build.
- `prisma.config.ts`: root Prisma CLI configuration for schema path, migrations path, and datasource URL loading.
- `tsconfig.json`: TypeScript compiler rules for development and tests.
- `tsconfig.build.json`: build-specific TS config for production output.
- `eslint.config.mjs`: shared lint rules for the TypeScript codebase.
- `docker-compose.yml`: local services for development, currently PostgreSQL and MailHog.
- `Makefile`: optional shortcuts around the most common npm and docker commands.

### `prisma/`

`prisma/` is the only canonical place for Prisma schema and migrations.

- `prisma/schema.prisma`: the Prisma schema file. On `main`, it only defines the datasource and generator. It must not define the team data models yet.
- `src/generated/prisma/`: generated Prisma client output after `npm run prisma:generate`. This is intentionally ignored from git.

What belongs here later:

- shared Prisma models
- `prisma/migrations/` once `L3` lands the migration baseline
- Prisma seed or helper files if the team later agrees on them

What does not belong here:

- Nest controllers or business logic
- module-specific service code

### `src/`

`src/` is the NestJS application source root. All backend runtime code belongs here.

- `src/main.ts`: Nest bootstrap file. It starts the app, sets the API prefix, enables validation, and applies shared infrastructure behavior.
- `src/app.module.ts`: root Nest module that wires together shared infrastructure and safe bootstrap modules.

### `src/common/`

`src/common/` is for framework-wide infrastructure shared by many modules.

#### `src/common/config/`

- `configuration.ts`: central configuration mapping from environment variables into a typed nested config object.
- `env.validation.ts`: shared validation rules for required environment variables.

Put here:

- global config
- shared infrastructure helpers
- code that multiple feature modules will use

Do not put here:

- feature-specific business logic
- module DTOs
- notification templates

#### `src/common/prisma/`

- `prisma.module.ts`: global Nest module that exposes Prisma to other modules.
- `prisma.service.ts`: shared Prisma client wrapper.

Put here:

- Prisma client setup
- shared database access helpers
- cross-project DB infrastructure

Do not put here:

- feature queries mixed with business rules
- module-specific repository logic that belongs to one owner

### `src/health/`

`src/health/` is the only safe runtime feature on `main`.

- `health.module.ts`: small Nest module for health checks.
- `health.controller.ts`: minimal endpoint used to confirm the scaffold boots.

Current safe endpoint:

- `GET /api/health`

### `src/modules/`

`src/modules/` is the team ownership area. Each Sprint owner should work in their own domain folder here.

- `src/modules/README.md`: module layout guide and recommended internal conventions.
- `src/modules/auth/`: reserved for `L1` Auth.
- `src/modules/quiz/`: reserved for `L2` Quiz.
- `src/modules/questions/`: reserved for `L3` Questions and schema-related question code.
- `src/modules/student/`: reserved for `L4` Student flow backend logic.
- `src/modules/attempts/`: reserved for `L5` Attempts and solving contract code.
- `src/modules/analytics/`: reserved for `L6` Analytics backend code.
- `src/modules/notifications/`: reserved for `L7` Notify email and notification module.
- `src/modules/integrity/`: reserved for integrity and cheating-event logic, currently aligned with `L7`.

Recommended internal layout inside each module once work begins:

- `controllers/`
- `services/`
- `dto/`
- `entities/` or `mappers/`
- `guards/`, `decorators/`, `strategies/` only when needed

### `docs/` and `docs/api/`

`docs/` holds backend documentation that should live beside the code.

- `docs/api/`: shared API contract area for request shapes, response shapes, and shared endpoint agreements.
- `docs/api/.gitkeep`: keeps the folder tracked before docs are added.

Put here later:

- shared contract docs
- endpoint notes
- integration assumptions between modules

### `test/`

`test/` is the root for end-to-end and system-level tests.

- `test/jest-e2e.json`: Jest configuration for e2e tests.
- `test/health.e2e-spec.ts`: smoke test for the safe health endpoint.

Recommended rule:

- unit tests can live close to their module files as `*.spec.ts`
- e2e or whole-app tests should live in `test/`

### Reference-only local material

- `misc/`: planning and mentor reference files. It is ignored by git and is not part of application runtime.

## Placement Rules

Use these rules when deciding where new code belongs:

- If it boots Nest, configures the app, or registers shared infrastructure, it belongs in `src/main.ts`, `src/app.module.ts`, or `src/common/`.
- If it is a database schema or migration, it belongs in `prisma/`.
- If it is a feature owned by one intern, it belongs in that intern's folder under `src/modules/`.
- If it is an API contract or interface agreement, it belongs in `docs/api/`.
- If it is a whole-app smoke or e2e test, it belongs in `test/`.

## Legacy Structure Policy

The old Python/FastAPI layout is deprecated and should not be recreated.

- Do not add `app/` back.
- Do not add `tests/` as a Python-style root.
- Do not add `pyproject.toml`, FastAPI files, SQLAlchemy files, or Alembic files.
- All backend runtime code now belongs under `src/`.
- All database schema and migrations now belong under `prisma/`.

## Prisma Rules For The Team

- `main` only contains the Prisma location and datasource/generator setup.
- `L3` should introduce the first shared Prisma models and the migration baseline.
- No one should create ad-hoc schema changes directly on `main`.
- Once Prisma modeling starts, every schema change should go through `prisma/schema.prisma` and a Prisma migration.

## Local Development

1. Use the recommended Node version:
   `nvm use`
2. Install dependencies:
   `npm install`
3. Copy environment variables:
   `cp .env.example .env`
4. Start local services:
   `docker compose up -d postgres mailhog`
5. Generate the Prisma client:
   `npm run prisma:generate`
6. Start the backend:
   `npm run start:dev`

Health check:

- `GET /api/health`

Mail testing:

- MailHog UI: `http://localhost:8025`

## Common Commands

- `npm run start:dev`
- `npm run build`
- `npm run lint`
- `npm run test`
- `npm run prisma:generate`
- `npm run prisma:format`
- `make db-up`
- `make db-down`

## Final Team Rules

- This repo is backend-only. Do not place frontend code here.
- `main` is for shared structure and conventions, not unfinished feature logic.
- Keep modules isolated under `src/modules/`.
- Keep shared infra under `src/common/`.
- Keep schema and migrations under `prisma/`.
