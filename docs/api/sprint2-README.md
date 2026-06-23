# Sprint 2 — Auto-Scoring & Integrity Event Capture

**Owner:** L5 (Mahmoud Mostafa)
**Branch:** `QNA-L502-auto-scoring-integrity`
**Status:** Ready for closeout ✅

---

## What Was Built

### 1. Scoring Engine (`src/modules/attempts/services/scoring.service.ts`)

Automatically grades a submitted attempt immediately on `POST /api/attempts/:id/submit`.

**How it works:**
1. Loads all `AttemptAnswer` rows for the attempt
2. Fetches `Question.correctAnswer` for each question
3. Runs `compareAnswer()` — a pure, deterministic function
4. Writes `isCorrect` on every answer
5. Writes `score`, `maxScore` on the attempt
6. Creates/upserts a `Result` record with `percentage` and `passed`
7. Returns the fully scored attempt in the same response

**Comparison logic:**
```
compareAnswer(selectedOptionId, correctAnswer):
  correctAnswer undefined  → null   (ungraded)
  selectedOptionId null    → false  (skipped)
  selected === correct     → true
  otherwise                → false
```

**Percentage:** `Math.round((score / maxScore) * 10000) / 100` — 2 decimal places, deterministic.

**Pass/fail threshold:** 50% (can be driven by `Quiz.passingScore` in a future sprint).

**Result persistence (upsert path):**
```typescript
this.prisma.result.upsert({
  where: { attemptId },
  create: { attemptId, studentId, quizId, score, maxScore, percentage, passed, gradedAt },
  update: { score, maxScore, percentage, passed, gradedAt },
})
```
This runs inside the same `$transaction` as the `attemptAnswer` updates, so the result is never half-written.

---

### 2. Result Model & Migration

**Model:** `prisma/schema.prisma` → `Result`

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `attemptId` | String | FK → attempts, unique (one result per attempt) |
| `studentId` | String | For fast student-level queries |
| `quizId` | String | For fast quiz-level queries |
| `score` | Int | Correct answer count |
| `maxScore` | Int | Gradable question count |
| `percentage` | Float | score/maxScore × 100, 2dp |
| `passed` | Boolean | percentage ≥ 50 |
| `gradedAt` | DateTime | When scoring ran |

**Migration:** `prisma/migrations/20260618120000_add_result_model/migration.sql`

**Cheating event log migration:** Already committed on main at
`prisma/migrations/20260609213000_notifications_integrity_foundation/migration.sql`
— this is L7's Sprint 1 foundation work. The `CheatingEventLog` table and
`CheatingEventType` enum are fully migrated. No additional migration needed for integrity events.

---

### 3. Result API

**Student:**
```
GET /api/results/:attemptId
→ own result only (403 if not owner)
→ returns { score, maxScore, percentage, passed, gradedAt }
```

**Admin:**
```
GET /api/results/:attemptId   → any student's result
GET /api/results?quizId=&studentId=  → list, filterable
```

Both endpoints require a valid JWT (`Authorization: Bearer <token>`).

---

### 4. Integrity Event Capture

**Endpoint:**
```
POST /api/integrity/events
Authorization: Bearer <token>   ← required
Body: {
  attemptId: string,
  eventType: CheatingEventType,
  description?: string,
  occurredAt?: ISO8601 string,
  metadata?: object
}
```

**Supported event types** (from `CheatingEventType` enum):
`TAB_HIDDEN`, `WINDOW_BLUR`, `WINDOW_FOCUS`, `FULLSCREEN_EXIT`, `COPY_PASTE`, `OTHER`

**Server-side ownership validation:**
1. JWT verified → `studentId` extracted from `req.user.sub`
2. `attempt.studentId` checked against JWT `studentId`
3. `attempt.status` must be `IN_PROGRESS`
4. Only then is the event logged

**Tab-switch hook integration contract for L4 (Next.js solving page):**

```typescript
// utils/integrity.ts — add to the Next.js frontend repo
export function logIntegrityEvent(
  attemptId: string,
  eventType: string,
  metadata?: Record<string, unknown>,
) {
  const token = localStorage.getItem('accessToken');
  // Fire-and-forget — never block or interrupt the quiz UI
  fetch(`${process.env.NEXT_PUBLIC_API_URL}/integrity/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ attemptId, eventType, metadata }),
  }).catch(() => {});
}

// Add to your quiz-taking page component:
useEffect(() => {
  const onVisibility = () => {
    if (document.hidden) {
      logIntegrityEvent(attemptId, 'TAB_HIDDEN', { timestamp: Date.now() });
    }
  };
  const onBlur   = () => logIntegrityEvent(attemptId, 'WINDOW_BLUR');
  const onFocus  = () => logIntegrityEvent(attemptId, 'WINDOW_FOCUS');
  const onCopy   = () => logIntegrityEvent(attemptId, 'COPY_PASTE');

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('blur', onBlur);
  window.addEventListener('focus', onFocus);
  document.addEventListener('copy', onCopy);

  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('focus', onFocus);
    document.removeEventListener('copy', onCopy);
  };
}, [attemptId]);
```

**Important:** The `occurredAt` field accepts a client-side ISO timestamp.
Send it so the timeline in the admin view is accurate even if there's
network latency between the event and the server receiving it.

---

### 5. Frontend Result Page

**File:** `frontend/app/attempts/[id]/result/page.tsx`

Fetches from two endpoints on mount:
- `GET /api/attempts/:id/result` — per-answer `isCorrect` breakdown
- `GET /api/results/:id` — `score`, `maxScore`, `percentage`, `passed`

Displays:
- Large percentage with green (pass) / red (fail) gradient card
- Correct / Wrong / Skipped summary strip
- Per-question answer breakdown list with colour-coded badges
- Back to Dashboard and View Quiz action buttons

Token read from `localStorage.getItem('accessToken')` — adjust to match
your frontend's auth storage pattern.

---

### 6. JWT Guard (`src/common/guards/jwt-auth.guard.ts`)

Reusable across all modules. Verifies the Bearer token against `jwt.secret`
from config, attaches `{ sub, email, role }` to `req.user`.

Usage:
```typescript
@UseGuards(JwtAuthGuard)
```

Available to any module that imports `JwtModule` and `ConfigModule`.

---

## Files Changed / Added

```
src/common/guards/
  jwt-auth.guard.ts                             ← NEW

src/modules/attempts/
  attempts.module.ts                            ← UPDATED (JwtModule, ResultsController)
  services/scoring.service.ts                   ← UPDATED (Result upsert added)
  controllers/results.controller.ts             ← NEW

src/modules/integrity/
  integrity.module.ts                           ← UPDATED (JwtModule, PrismaModule)
  controllers/integrity.controller.ts           ← UPDATED (JWT guard, ownership validation)

prisma/
  schema.prisma                                 ← UPDATED (Result model + relation)
  migrations/20260618120000_add_result_model/
    migration.sql                               ← NEW

frontend/
  app/attempts/[id]/result/page.tsx             ← NEW

docs/api/
  sprint2-README.md                             ← NEW (this file)
```

---

## Integration Dependencies

| With | What they need from L5 |
|---|---|
| L4 (solving page) | Tab-switch hook code above; `POST /api/integrity/events` endpoint |
| L6 (analytics) | `Result` table — query by `quizId`, `passed`, `percentage` |
| L7 (admin integrity view) | `cheating_event_logs` table — indexed by `attemptId`, `eventType`, `occurredAt` |
| L1 (auth) | JWT guard reuses their `jwt.secret` config key |
| L3 (schema) | `Result` model added to `schema.prisma` — needs migration coordination |
