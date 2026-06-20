# Quiz Live Testing

**Owner:** Quiz module  
**Module:** `src/modules/quiz/`  
**General guide:** `docs/testing/live-server-testing.md`

This is the feature-specific live testing note for the admin quiz APIs.

## What static tests already cover

`test/quiz-admin.e2e-spec.ts` runs in-process with mocked Prisma. It proves:

- DTO validation
- Status mapping
- Publish and unpublish business rules
- Error handling for missing quizzes and empty publish attempts

It does **not** prove:

- The Nest API container starts cleanly against the real Postgres stack
- Migrations and seed data apply successfully in Docker
- The real `questions` endpoint can create a question needed for quiz publishing
- HTTP requests work end-to-end against the running service

## What live tests prove

File: `test/live/quiz.live-spec.ts`

| Step | Validates |
|---|---|
| `GET /api/health` | API container is healthy |
| `POST /api/admin/quizzes` | Real quiz creation through HTTP |
| `GET /api/admin/quizzes/:id` | Read-after-write works against Postgres |
| `PATCH /api/admin/quizzes/:id` | Real update path works |
| `POST /api/questions` | A real question can be attached to the quiz |
| `POST /api/admin/quizzes/:id/publish` | Publish succeeds once the quiz has a question |
| `POST /api/admin/quizzes/:id/unpublish` | Unpublish moves it back to draft |
| `DELETE /api/admin/quizzes/:id` | Hard delete removes the quiz and its cascade children |

The live spec creates its own quiz, adds a question, and cleans up after itself.

## Run it

### Full automated smoke

```powershell
.\scripts\run-live-tests.ps1
```

### Manual quiz-only run

```powershell
docker compose up -d --build postgres mailhog api
npm run prisma:migrate:deploy
npm run db:seed
$env:LIVE_TESTS='1'
npm run test:live -- test/live/quiz.live-spec.ts
```

## Seed data used

`prisma/seed.ts` still runs as part of the live stack bootstrap, but the quiz live suite does not depend on a seeded quiz record.

The quiz live suite only relies on:

- a healthy API container
- a working Postgres connection
- the real `questions` endpoint for publish setup

## Manual HTTP checks

Create a draft quiz:

```powershell
curl.exe -X POST "http://localhost:3002/api/admin/quizzes" `
  -H "Content-Type: application/json" `
  -d "{\"title\":\"Live Quiz Demo\"}"
```

Publish a quiz after adding a question:

```powershell
curl.exe -X POST "http://localhost:3002/api/admin/quizzes/<quiz-id>/publish"
```

Delete a quiz:

```powershell
curl.exe -X DELETE "http://localhost:3002/api/admin/quizzes/<quiz-id>"
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Publish returns `400` | Quiz has no questions yet | POST a question to `/api/questions` first |
| Create returns validation errors | Missing required title or invalid dates | Compare the payload to `docs/api/quiz.md` |
| Delete returns `404` during cleanup | The test already deleted the quiz | Safe to ignore; the spec treats cleanup as best effort |
| Live test skips entirely | `LIVE_TESTS` not set | Set `LIVE_TESTS=1` before running Jest |
