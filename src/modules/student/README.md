# Student Module (L4)

Owner: Learner 4 — Student Quiz Solving & Email Link Flow.

## Scope of this iteration

Three read-only endpoints that power the student dashboard and quiz
instruction screen:

| Method | Path                            | Purpose                                  |
|--------|---------------------------------|------------------------------------------|
| GET    | `/api/student/quizzes`          | List PUBLISHED quizzes the student can take |
| GET    | `/api/student/quizzes/:id`      | Quiz instruction screen                  |
| GET    | `/api/student/attempts/active`  | Resume the current in-progress attempt   |

## Schema dependency

This module reads **only** the existing `Quiz`, `Question`, and `Attempt`
models from the current `prisma/schema.prisma`. No schema changes are
introduced and no migrations are added.

Out of scope for this iteration (handled by other modules or future work):

- The solving flow itself (start / save / submit / result) → owned by L5
  in `src/modules/attempts/`.
- Timer + auto-submit → later L4 sprint.
- Cheating-event capture → owned by L7 in `src/modules/integrity/`.
- Invitation flow (per-student filtering) → not present in the current
  schema; L4 lists all PUBLISHED quizzes inside their active time
  window. When L2 adds the `Invitation` model, the service can be
  extended without breaking this contract.
- Auth: student id is stubbed as `req.user?.sub ?? 'stub-student-id'`
  (mirrors L5's `AttemptsController`).

## Tests

- `test/student.e2e-spec.ts` — unit tests of `StudentService` with a
  mocked `PrismaService` (same pattern as `test/attempts.e2e-spec.ts`).
- `test/student-http.e2e-spec.ts` — HTTP-level e2e tests with
  `INestApplication` and a mocked `PrismaService`
  (same pattern as `test/quiz-admin.e2e-spec.ts`).

Run with:

```bash
npm run lint
npm run build
npm test
```
