# Module Ownership Layout

Each Sprint 1 owner should work inside their own folder under `src/modules/`.

Current reserved module folders:

- `auth/`
- `quiz/`
- `questions/`
- `student/`
- `attempts/`
- `analytics/`
- `notifications/`
- `integrity/`

Recommended internal layout for each module once implementation begins:

- `controllers/` for Nest controllers
- `services/` for business logic
- `dto/` for request and response contracts
- `entities/` or `models/` for Prisma-facing shapes and mappers
- `guards/`, `decorators/`, or `strategies/` only if the module needs them

Keep shared infrastructure out of module folders. Shared config and Prisma access should stay under `src/common/`.
