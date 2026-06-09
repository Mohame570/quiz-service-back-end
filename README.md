# Quiz Service Backend

This repository is the backend-only foundation for the internship quiz platform.
For Sprint 1, `main` intentionally contains only the shared backend scaffold and team conventions so each module owner can branch safely without stepping on another task.

## Backend Stack

- Python 3.11
- FastAPI
- SQLAlchemy 2.0 (async style)
- PostgreSQL
- Alembic
- pytest
- SMTP integration for email delivery

## Sprint 1 Coordination

### Current rule for `main`

Safe on `main`:

- shared documentation and repo conventions
- dependency and tooling setup
- a minimal FastAPI application shell
- generic config and database plumbing
- empty package scaffolding for owned modules
- local development helpers such as `docker-compose.yml` and `Makefile`

Keep off `main` until owners implement them on feature branches:

- notification service logic, templates, and models
- integrity and cheating-event models
- user, quiz, question, and attempt models
- real Alembic migration setup and version files
- feature routers and cross-module wiring
- anything that belongs to a Sprint 1 owner deliverable

### Ownership and dependencies

- `L3` owns migration bootstrap and schema versioning for Sprint 1. Treat it as the main technical blocker for data-model work.
- `L5` defines the attempt contract that `L6` analytics depends on.
- `L7` owns notifications and integrity work, but full wiring into Auth and Quiz is a later integration step.
- `L4` can move in parallel only after `L1` and `L2` contracts are stable enough to consume.

### Recommended branch flow

1. Merge this shared scaffold into `main`.
2. Have each module owner branch from `main`.
3. Nominate the `L3` owner as migration integrator for Alembic baseline and version ordering.
4. Document every shared contract change in the PR description or docs before merge.
5. Use a temporary integration branch later only if several unfinished modules need to be tested together.

## Project Layout

```text
.
├── .gitignore
├── README.md
├── app/
│   ├── api/
│   │   ├── __init__.py
│   │   └── router.py
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py
│   │   └── db.py
│   ├── integrity/
│   │   └── __init__.py
│   ├── notifications/
│   │   └── __init__.py
│   ├── __init__.py
│   └── main.py
├── docs/
│   └── api/
│       └── .gitkeep
├── tests/
│   └── test_health.py
├── .env.example
├── docker-compose.yml
├── Makefile
└── pyproject.toml
```

`migrations/` is intentionally not bootstrapped on `main` yet. That work should land from the `L3` branch together with the team's migration policy.

## File And Folder Roles

This section explains what each current file and folder is for, and what should be placed there later.

### Root files

- `README.md`: the shared guide for the backend repo. It explains scope, branch rules, layout, and local setup.
- `.gitignore`: keeps local-only or generated files out of git, such as `.env`, virtual environments, caches, and test artifacts.
- `pyproject.toml`: the Python project definition. This is where shared dependencies, optional dev dependencies, and tool configuration live.
- `.env.example`: the example environment file. Add new shared environment variables here when the team agrees on them.
- `docker-compose.yml`: local infrastructure for development. Right now it starts PostgreSQL for backend work.
- `Makefile`: common shortcuts for install, lint, test, run, and local database commands.

### `app/`

`app/` is the backend source-code root. Application code should live here, not at the repo root.

- `app/__init__.py`: marks `app/` as a Python package.
- `app/main.py`: the FastAPI application entrypoint. It creates the app instance and mounts shared routers.

### `app/api/`

`app/api/` is for HTTP routing and API-layer composition.

- `app/api/__init__.py`: marks the API package.
- `app/api/router.py`: the shared router aggregator. On `main`, this should stay minimal and only contain safe shared endpoints like `/health`. Feature-specific routes should be added by module owners on their branches.

Put here later:

- shared router registration
- safe cross-project API composition
- non-business endpoints such as health/readiness checks

Do not put here on `main`:

- Auth, Quiz, Student, Analytics, or Notify feature endpoints
- cross-module integration behavior

### `app/core/`

`app/core/` is for framework-level plumbing used by multiple modules.

- `app/core/__init__.py`: marks the core package.
- `app/core/config.py`: central app settings loaded from environment variables.
- `app/core/db.py`: shared async SQLAlchemy engine and session factory setup.

Put here later:

- shared settings
- shared database/session helpers
- framework-wide infrastructure used by many modules

Do not put here:

- feature-specific business rules
- module models or email logic

### `app/notifications/`

`app/notifications/` is reserved for the `L7` Notify module that you own.

- `app/notifications/__init__.py`: placeholder package file only for now.

This folder is where these task-owned files will later belong on your feature branch, not on `main`:

- `app/notifications/service.py`
- `app/notifications/templates.py`
- `app/notifications/models.py`

Put here later:

- email sending service code
- reusable email templates
- notification-related models and helpers
- internal notification APIs once your branch owns that work

### `app/integrity/`

`app/integrity/` is reserved for integrity and cheating-event logging.

- `app/integrity/__init__.py`: placeholder package file only for now.

This folder is where `app/integrity/models.py` will later belong on your feature branch, not on `main`.

Put here later:

- cheating or integrity log models
- integrity-related services or validators, if the team keeps that logic separate

### `docs/` and `docs/api/`

`docs/` is for backend documentation that should live with the codebase.

- `docs/api/`: shared API documentation area.
- `docs/api/.gitkeep`: keeps the directory tracked while it is still empty.

Put here later:

- shared API templates
- request/response contracts
- endpoint behavior notes agreed between module owners

### `tests/`

`tests/` is the automated test root.

- `tests/test_health.py`: a minimal smoke test proving the scaffold boots and the shared health endpoint works.

Put here later:

- unit tests for shared infrastructure
- module tests on each owner branch
- integration tests once cross-module behavior exists

### Reserved but intentionally absent

- `migrations/`: intentionally missing on `main`. The `L3` owner should introduce Alembic bootstrap and version files from their branch because migration setup is a Sprint 1 dependency for the team.

### Reference-only local material

- `misc/`: planning and mentor reference documents used for coordination. This folder is ignored by git and is not part of the backend application runtime.

## Placement Rules

Use these quick rules when deciding where something belongs:

- If it is application startup, router wiring, settings, or DB plumbing, it likely belongs in `app/main.py`, `app/api/`, or `app/core/`.
- If it sends emails or defines notification templates/models, it belongs in `app/notifications/`.
- If it logs cheating or integrity-related events, it belongs in `app/integrity/`.
- If it is an API contract or endpoint documentation, it belongs in `docs/api/`.
- If it is a test, it belongs in `tests/`.
- If it is a database migration, it belongs in `migrations/`, but that folder should first be introduced by the `L3` branch rather than directly on `main`.

## Local Development

1. Create a virtual environment:
   `python -m venv .venv`
2. Activate it:
   `source .venv/bin/activate`
3. Install dependencies:
   `pip install -e ".[dev]"`
4. Copy environment variables:
   `cp .env.example .env`
5. Start PostgreSQL:
   `docker compose up -d postgres`
6. Run the API:
   `uvicorn app.main:app --reload`

Health check:

- `GET /health`

## Notes For Module Owners

- `app/notifications/` is reserved for the `L7` Notify implementation.
- `app/integrity/` is reserved for integrity logging models and related code.
- `docs/api/` is reserved for shared API contract docs and templates.
- Frontend work should stay out of this repository.
