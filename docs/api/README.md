# API Contract Rules

Use `docs/api/` to document shared backend contracts before or alongside implementation.

Start new contract docs from `docs/api/_template.md`.

Recommended approach:

- one file per module contract area:
  - `auth.md` — L1 authentication
  - `quiz.md` — L2 quiz admin
  - `questions.md` — L3 question bank
  - `student.md` — L4 student entry flow
  - `attempts.md` — L5 attempts / solving contract
  - `notifications.md` — L7 email and delivery logs
  - analytics contract: `docs/analytics_contract.md`
- document request shape, response shape, auth requirements, and important side effects
- note any dependency on another module's endpoint or Prisma model
- update the contract doc whenever a shared interface changes

Minimum sections for each contract document:

1. endpoint or event name
2. owner module
3. request payload
4. response payload
5. validation rules
6. dependencies on other modules
7. open questions

This folder is for team coordination and integration safety. It should stay lightweight, but it should always reflect the latest agreed contract.
