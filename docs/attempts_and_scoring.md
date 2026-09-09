# Attempts and Scoring Finalization

**Owner:** Attempts and Attempt Expiration modules  
**Modules:** `src/modules/attempts/`, `src/modules/attempt-expiration/`  
**Consumed by:** Student solving flow, analytics, admin grading

This document describes how an attempt is finalized after the student submits,
the server detects expiration, or another system explicitly marks the attempt
as abandoned.

---

## 1. Finalization outcomes

An attempt starts with `IN_PROGRESS` and may be finalized through one of these
paths:

| Trigger | Status transition | Scored? | Result |
|---|---|---:|---|
| Student submits normally | `IN_PROGRESS -> SUBMITTED` | Yes | Created or updated |
| Server scheduler detects `expiresAt` | `IN_PROGRESS -> TIMED_OUT` | Yes | Created or updated |
| Explicit abandonment signal | `IN_PROGRESS -> ABANDONED` | Yes | Created or updated |

`TIMED_OUT` and `ABANDONED` are finalized attempts. They must not be treated as
active attempts and must not accept further answer changes.

The scheduler does not infer abandonment from the student leaving the page.
Leaving the page, closing the browser, losing connectivity, or navigating away
does not by itself provide a reliable abandonment signal. `ABANDONED` requires
an explicit trigger from another part of the system, such as a future abandon
endpoint or an agreed server-side business rule.

---

## 2. Normal student submission

The student-facing flow is exposed under `/api/student`:

| Method | Endpoint | Purpose |
|---|---|---|
| PATCH | `/api/student/attempts/:attemptId/answers` | Save or update answers while in progress |
| POST | `/api/student/attempts/:attemptId/submit` | Finalize and score the attempt |
| GET | `/api/student/attempts/:attemptId/result` | Read a finalized attempt and its Result |

Answers are persisted incrementally as `AttemptAnswer` rows. The save operation
uses an upsert keyed by `(attemptId, questionId)`, so the scheduler does not
need to save answers again when it finalizes an attempt. It scores the answers
that are already persisted in the database.

Answers that exist only in the browser and were never successfully sent to the
API cannot be recovered by the scheduler and are treated as unanswered.

Normal submission performs the following steps:

1. Confirm that the attempt exists, belongs to the student, and is
	`IN_PROGRESS`.
2. Persist any final answers included in the submit request.
3. Set `status` to `SUBMITTED` and set `submittedAt`.
4. Run `ScoringService.scoreAttempt(attemptId)`.
5. Persist the attempt score, answer grading fields, and `Result`.

Implementation references:

- `AttemptsService.submit()`
- `StudentService.submitAttempt()`
- `ScoringService.scoreAttempt()`

---

## 3. Automatic expiration finalization

`expiresAt` is persisted when the attempt starts:

```text
expiresAt = startedAt + quiz.durationMinutes * 60,000
```

The `AttemptExpirationService` runs through NestJS scheduling at a fixed
interval. It selects attempts where:

```text
status = IN_PROGRESS
expiresAt <= now
```

For each candidate, it atomically claims the attempt by updating it only while
it is still `IN_PROGRESS` and expired. This protects against a race with a
student submission or another scheduler execution.

After the claim succeeds, the scheduler:

1. Sets `status` to `TIMED_OUT`.
2. Sets `submittedAt` to the finalization time.
3. Calls the reusable scoring pipeline with the attempt ID.
4. Allows `ScoringService` to reload the persisted answers.
5. Creates or updates the `Result`.

The scheduler does not need to pass the loaded answers to the scoring service.
Passing the attempt ID is sufficient because `scoreAttempt()` reads the
attempt, its answers, the quiz questions, and the passing score from the
database.

If scoring fails during finalization, the transaction rolls back, so the attempt remains IN_PROGRESS and no partial Result is persisted. This prevents an attempt from being marked TIMED_OUT without a corresponding successful scoring operation. The failed finalization can then be retried by a subsequent scheduler run.

Implementation references:

- `AttemptExpirationService.finalizeExpiredAttempts()`
- `AttemptTimerUtil.isExpired()`
- `ScoringService.scoreAttempt()`

---

## 4. Explicit abandonment

The `AttemptStatus` enum contains `ABANDONED`, but page navigation is not an
abandonment event. An explicit signal is required before using this status.

The signal may come from a future endpoint, an administrative action, or
another agreed server-side workflow. Whatever component owns that trigger must
atomically transition only an `IN_PROGRESS` attempt:

```text
IN_PROGRESS -> ABANDONED
```

It must then call the same finalization/scoring pipeline used for timeout and
normal submission. The pipeline must:

- Load the attempt and all persisted answers.
- Grade automatically gradable answers.
- Leave non-empty essays pending manual grading where applicable.
- Update `Attempt.score` and `Attempt.maxScore`.
- Create or update the unique `Result` row.
- Prevent further answer changes after finalization.

This keeps `ABANDONED` behavior consistent with `TIMED_OUT` and avoids a
second scoring implementation.

There is currently no public quit or abandon endpoint. The frontend Quit
button only navigates back to the quiz list and does not change the attempt
status.

---

## 5. Scoring and Result persistence

`ScoringService` is the shared scoring pipeline for finalized attempts.

It calculates:

- `maxScore`: sum of the points assigned to all quiz questions.
- `score`: points earned by the persisted answers.
- `percentage`: score as a percentage of `maxScore`, rounded to two decimals.
- `passed`: percentage compared with `quiz.passingScore`.
- `gradingStatus`: `COMPLETE` or `PARTIAL`.
- `pendingEssayCount`: non-empty essay answers awaiting manual grading.

The service updates each persisted `AttemptAnswer`, updates the `Attempt`, and
upserts `Result` using `attemptId` as the unique key.

For a missing answer, there is no `AttemptAnswer` row. It earns no points but
the question remains included in `maxScore`. An empty answer row is graded as
incorrect for automatically gradable questions. A non-empty essay remains
pending manual grading.

---

## 6. Attempt status rules

| Status | Meaning | Can save answers? | Included in active attempts? |
|---|---|---:|---:|
| `IN_PROGRESS` | Attempt is still being worked on | Yes | Yes |
| `SUBMITTED` | Student submitted normally | No | No |
| `TIMED_OUT` | Server finalized after `expiresAt` | No | No |
| `ABANDONED` | Explicitly finalized by an abandonment trigger | No | No |

Grading status is separate from attempt status:

| Grading status | Meaning |
|---|---|
| `COMPLETE` | All gradable answers have a final score |
| `PARTIAL` | One or more non-empty essays await manual grading |

---

## 7. Analytics handover note

Analytics should treat finalized SUBMITTED, TIMED_OUT, and, once an explicit abandonment trigger exists, ABANDONED attempts as submitted-for-scoring.

The finalized set is:

```text
status IN (SUBMITTED, TIMED_OUT, ABANDONED)
```

Analytics consumers should use this set when calculating completion counts,
attempt totals for scoring, score averages, and finalized-attempt reporting.
They should continue to exclude `IN_PROGRESS` attempts from submitted-for-
scoring metrics.

The attempt payload should continue to expose:

- `attemptId`
- `status`
- `score`
- `maxScore`
- `submittedAt`

For `TIMED_OUT` and `ABANDONED`, `submittedAt` represents the server-side
finalization time. The analytics implementation must include these statuses in
its finalized filters and status breakdowns; checking only `SUBMITTED` is not
sufficient for the new lifecycle.

For attempts with pending essays, analytics should use the `Result` fields
`gradingStatus`, `pendingEssayCount`, `percentage`, and `passed` rather than
assuming that finalization always means grading is complete.

---

## 8. Verification

The finalization behavior should be verified for:

- Normal submission produces `SUBMITTED` and a `Result`.
- The scheduler changes expired `IN_PROGRESS` attempts to `TIMED_OUT`.
- Persisted answers are used by scheduled scoring.
- Missing answers earn zero points without breaking finalization.
- The scheduler does not mark page navigation as `ABANDONED`.
- An explicit abandonment trigger, when implemented, should produce `ABANDONED` and a `Result` through the same finalization/scoring pipeline.
- Finalized attempts reject further answer updates.
- Analytics includes `SUBMITTED`, `TIMED_OUT`, and `ABANDONED` in finalized metrics.

Relevant commands:

```bash
npm run build
npm run lint
npm test
```
