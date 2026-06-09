# Contributing Guide

This document defines how contributors should build features in this backend repository so work merges cleanly across the team.

This repo is backend-only and is locked to:

- `NestJS`
- `PostgreSQL`
- `Prisma`

## Core Rules

- Start every feature from the latest `main`.
- Work only in your owned module area unless a shared change is required.
- Keep feature logic out of `src/common/` unless the code is truly shared infrastructure.
- Do not commit local-only or generated folders such as `node_modules/`, `dist/`, `src/generated/prisma/`, or `.env`.
- Document shared API and schema changes before asking for merge.

## Branch Naming

Every feature branch must follow this format:

`QNA-L#xx-feature-name`

Meaning:

- `L#` = learner number
- `xx` = 2-digit sprint number
- `feature-name` = short kebab-case description of the work

Current sprint:

- `01`

Examples:

- Learner 7, Sprint 01, notification foundation:
  `QNA-L701-notification-foundation`
- Learner 3, Sprint 01, question schema setup:
  `QNA-L301-question-schema-setup`
- Learner 2, Sprint 01, quiz CRUD endpoints:
  `QNA-L201-quiz-crud-endpoints`

Rules:

- Always branch from updated `main`.
- Use lowercase kebab-case for the feature part.
- Keep one branch for one logical feature or task.
- Do not reuse an old branch for a different task.

## Ownership And Where Code Goes

Each learner should work mainly inside their owned module folder under `src/modules/`.

### Module ownership

- `L1` Auth: `src/modules/auth/`
- `L2` Quiz: `src/modules/quiz/`
- `L3` Questions and migration integration: `src/modules/questions/` plus coordinated work in `prisma/`
- `L4` Student: `src/modules/student/`
- `L5` Attempts / solving contract: `src/modules/attempts/`
- `L6` Analytics: `src/modules/analytics/`
- `L7` Notifications: `src/modules/notifications/`
- `L7` Integrity / cheating logs: `src/modules/integrity/`

### Recommended module structure

Inside your module folder, use this layout when needed:

- `controllers/` for Nest controllers
- `services/` for business logic
- `dto/` for request and response DTOs
- `guards/` for auth or access control guards
- `decorators/` for custom Nest decorators
- `strategies/` for auth strategies if needed
- `mappers/` or `entities/` for mapping between Prisma data and API shapes
- `*.spec.ts` files near the code for unit tests

Example:

```text
src/modules/notifications/
├── notifications.module.ts
├── controllers/
├── services/
├── dto/
├── templates/
└── notifications.service.spec.ts
```

## Shared Areas And When You May Edit Them

These areas are shared across the team and should be changed carefully:

- `src/common/`: only for shared infrastructure used by multiple modules
- `src/app.module.ts`: only when wiring a new module into the application
- `prisma/schema.prisma`: only for agreed schema changes
- `prisma/migrations/`: only for agreed and reviewed schema migrations
- `docs/api/`: shared contract documentation
- `README.md` and `CONTRIBUTING.md`: only when structure or process changes

Do not put feature-specific business logic in:

- `src/common/`
- `src/main.ts`
- root-level files outside the module folders

## Feature Workflow

Follow this workflow for every feature.

1. Update your local `main`.
2. Create a new branch from `main` using the naming rule.
3. Build the feature inside your owned module folder.
4. Update or create the needed API or schema documentation.
5. Run local checks.
6. Commit your work.
7. Push your branch.
8. Open a pull request into `main`.
9. Request review from the right people.
10. Merge only after approval and passing checks.

Suggested commands:

```bash
git checkout main
git pull origin main
git checkout -b QNA-L701-notification-foundation
```

Then after your work:

```bash
git push -u origin QNA-L701-notification-foundation
```

## API Changes

If you add or edit an API:

- place controllers, services, and DTOs inside your module folder
- keep endpoint-specific validation close to that module
- document the API in `docs/api/`
- update the contract doc before requesting merge

Use one contract file per area when possible, for example:

- `docs/api/auth.md`
- `docs/api/quiz.md`
- `docs/api/attempts.md`
- `docs/api/notifications.md`

Each shared API doc should include at least:

1. endpoint or event name
2. owner module
3. request payload
4. response payload
5. auth requirements
6. validation rules
7. dependencies on other modules
8. side effects
9. open questions

If your API is consumed by another learner's module:

- mention that dependency in the doc
- tag the affected learner in the PR
- do not merge a breaking contract change silently

## Database And Prisma Changes

All database schema work must go through `Prisma`.

### Where schema work goes

- schema definitions: `prisma/schema.prisma`
- migrations: `prisma/migrations/`
- generated client: `src/generated/prisma/` but this folder is generated locally and must not be committed

### Schema change rules

- `L3` is the Sprint 1 migration integrator
- do not make uncoordinated shared schema changes on `main`
- if your feature needs a model, field, relation, enum, or index change, coordinate first
- until the initial shared schema baseline is merged, avoid ad-hoc model changes from unrelated branches

### When you need a DB or model change

1. Write down the required change in the relevant file under `docs/api/`
2. Explain why the schema change is needed and which modules depend on it
3. Coordinate with `L3` and any affected module owners
4. Update `prisma/schema.prisma` on your feature branch only after alignment
5. Run:
   - `npm run prisma:format`
   - `npm run prisma:generate`
6. If migration generation is part of the agreed change, include the resulting migration files
7. Mention the schema impact clearly in the PR description

Do not:

- edit generated Prisma client files by hand
- commit database dumps
- sneak shared schema changes into unrelated PRs

## Documentation Rules

Documentation is part of the feature, not a cleanup step after it.

Update docs when you change:

- shared API shape
- auth requirements
- request or response format
- side effects such as sending email or creating an attempt
- DB schema used by other modules

Minimum documentation locations:

- architecture and structure changes: `README.md`
- team process changes: `CONTRIBUTING.md`
- API and cross-module contracts: `docs/api/`

## Pull Request Rules

Every feature must be merged through a PR into `main`.

### PR checklist

- branch name follows the required naming rule
- scope is focused and not mixing unrelated features
- code is placed in the correct module folder
- shared API docs are updated if needed
- Prisma schema or migration changes are documented if needed
- local checks pass
- affected owners are tagged for review

### Request review from

- your module reviewer or teammate
- `L3` if `prisma/schema.prisma` or `prisma/migrations/` changed
- any impacted module owner if you changed a shared API or behavior they depend on
- the owner of any shared file you had to modify outside your module folder

### Good PR title examples

- `L7 S01: add notification module skeleton`
- `L5 S01: add attempt DTOs and service flow`
- `L2 S01: add quiz CRUD controller and contracts`

## Quality Gates Before Review

Run the relevant local checks before opening or updating a PR:

```bash
npm run prisma:generate
npm run build
npm run lint
npm run test
```

If you changed the Prisma schema, also run:

```bash
npm run prisma:format
```

## What Must Never Be Committed

Do not commit:

- `node_modules/`
- `dist/`
- `src/generated/prisma/`
- `.env`
- local logs
- editor-specific local files

## Clean Merge Expectations

To keep merges clean:

- rebase or pull latest `main` before opening the PR if the base moved
- keep PRs small and focused
- avoid mixing structure changes, schema changes, and unrelated feature work in one branch
- document breaking changes early
- coordinate before touching shared files

If in doubt, prefer:

- smaller PRs
- clearer docs
- explicit review requests

That is better than merging a big unclear branch that blocks the rest of the team.
