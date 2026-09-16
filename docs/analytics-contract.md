# Analytics Data Contract

**Owner module:** `AnalyticsModule`
**Status:** Sprint 1 metric vocabulary, extended in Sprint 2 with the live dashboard, quiz-metric, and follow-up endpoints that implement it (see §13).

## 1. Purpose

This document defines the five core metrics used across all analytics surfaces (admin dashboard, per-quiz reporting, future exports): **participation, completion, score, absence, and follow-up**. It exists so every dashboard, endpoint, and report built on top of quiz data uses the same definitions — preventing scenarios where two features silently disagree on what "0 attempts" or "not completed" means.

## 2. Anchor concept: assignment

Every metric below is defined **relative to assignment**, not in isolation. A student is *assigned* to a quiz via the `Quiz.students` relation (`StudentProfile[]`, a many-to-many join). Assignment is the denominator for every rate calculation in this document.

Without this anchor, "zero attempts" is ambiguous: it could mean nobody is assigned yet, or everyone assigned has ignored it. This document exists specifically to prevent that conflation.

## 3. Core metric definitions

### 3.1 Participation

A student has **participated** in a quiz if at least one `Attempt` record exists for that `(studentId, quizId)` pair, regardless of its `status`. `IN_PROGRESS`, `SUBMITTED`, `TIMED_OUT`, and `ABANDONED` all count as participation — the student engaged with the quiz.

```
participationRate = distinct(studentId) with ≥1 Attempt / total assigned students
```

Participation does **not** imply completion. A `TIMED_OUT` or `ABANDONED` attempt is participation without a finished outcome.

### 3.2 Completion

A student has **completed** a quiz if their most recent `Attempt` has `status = SUBMITTED` **and** a linked `Result` record exists.

```
completionRate = distinct(studentId) with latest Attempt.status = SUBMITTED / total assigned students
```

`TIMED_OUT` and `ABANDONED` attempts count toward participation but explicitly **not** completion — they represent engagement without a finished outcome and must be reported separately, never folded into either "completed" or "absent."

### 3.3 Score

Score is only meaningful **after** completion. It is sourced from `Result.score`, `Result.maxScore`, and `Result.percentage` (never recomputed independently from `Attempt`).

**Rule:** a student who has not completed the quiz has `score: null` — never `0`. A `score` of `0` is a real, distinct outcome (attempted and scored zero) and must never be used as a stand-in for "did not attempt" or "not yet graded."

### 3.4 Absence

A student is **absent** from a quiz only when **both** of the following hold:
1. They are assigned to the quiz (`Quiz.students` includes them), **and**
2. The quiz's response window has closed (`Quiz.endsAt` is in the past, where `endsAt` is set — see §5 for quizzes with no window), **and**
3. Zero `Attempt` records exist for that student on that quiz.

**Critical rule:** before `endsAt` has passed, zero attempts means the student **has not started yet** (`NOT_STARTED`) — never `ABSENT`. Labeling a student absent while the quiz window is still open is the exact empty-state conflation this contract exists to prevent, and this rule is the single most load-bearing rule in this document.

### 3.5 Follow-up

An attempt requires **follow-up** when it has finished from the student's perspective (`status = SUBMITTED`) but is not yet fully resolved from the grading perspective — specifically when its linked `Result.gradingStatus = PARTIAL` and `Result.pendingEssayCount > 0` (one or more `ESSAY`-type answers awaiting manual grading via the admin grading queue).

A student in follow-up is simultaneously "completed" (they submitted) and "provisional" (their score/percentage may change once grading finishes). Dashboards must surface this as a distinct state, not silently show a possibly-incomplete score as final.

## 4. Empty-state rules (authoritative)

This table is the definitive mapping from raw data to a displayable status. Any endpoint or dashboard computing a per-student quiz status must follow this table exactly.

| Attempts on record | Quiz window | Result state | Status label | Notes |
|---|---|---|---|---|
| 0 | Open (`endsAt` null or future) | — | `NOT_STARTED` | Not absent — window still open |
| 0 | Closed (`endsAt` in the past) | — | `ABSENT` | Assigned, window closed, never attempted |
| ≥1, latest = `IN_PROGRESS` | Open | — | `IN_PROGRESS` | Participating, not yet finished |
| ≥1, latest = `SUBMITTED` | any | `gradingStatus = COMPLETE` | `COMPLETED` | Final score available |
| ≥1, latest = `SUBMITTED` | any | `gradingStatus = PARTIAL`, `pendingEssayCount > 0` | `COMPLETED_PENDING_REVIEW` | Follow-up required; score provisional |
| ≥1, latest = `TIMED_OUT` | any | — | `PARTICIPATED_NOT_COMPLETED` | Engaged, ran out of time, no submission |
| ≥1, latest = `ABANDONED` | any | — | `PARTICIPATED_NOT_COMPLETED` | Engaged, left without submitting |

A student not assigned to a quiz at all is **out of scope** for that quiz's metrics entirely — they must never appear in any of the counts above (no `NOT_STARTED`, no `ABSENT`; they simply aren't counted in the denominator).

## 5. Edge case: quizzes with no closing window

Some quizzes have `endsAt = null` (open-ended, e.g. practice quizzes). For these, the `ABSENT` state is **never reached** — a student with zero attempts on an always-open quiz is `NOT_STARTED` indefinitely, since there is no window-close event to trigger the absence determination. This is intentional: absence requires a defined deadline to be a meaningful concept.

## 6. Payload schema — per-student quiz status

```typescript
interface StudentQuizMetric {
  studentId: string;
  studentName: string;
  quizId: string;
  status:
    | 'NOT_STARTED'
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'COMPLETED_PENDING_REVIEW'
    | 'PARTICIPATED_NOT_COMPLETED'
    | 'ABSENT';
  score: number | null;       // null unless status is COMPLETED or COMPLETED_PENDING_REVIEW
  maxScore: number | null;
  percentage: number | null;
  attemptId: string | null;   // null only when status is NOT_STARTED or ABSENT
  startedAt: string | null;   // ISO 8601
  submittedAt: string | null; // ISO 8601
  followUpRequired: boolean;  // true only when status is COMPLETED_PENDING_REVIEW
  pendingEssayCount: number;  // 0 unless followUpRequired is true
}
```

## 7. Payload schema — quiz-level metric summary

```typescript
interface QuizMetricSummary {
  quizId: string;
  quizTitle: string;
  windowClosed: boolean;       // derived: endsAt !== null && endsAt < now
  assignedCount: number;       // size of Quiz.students
  participationCount: number;  // distinct students with ≥1 Attempt
  completionCount: number;     // distinct students with status COMPLETED or COMPLETED_PENDING_REVIEW
  absenceCount: number;        // only non-zero once windowClosed = true
  followUpCount: number;       // distinct students with status COMPLETED_PENDING_REVIEW
  participationRate: number;   // participationCount / assignedCount, 0 when assignedCount = 0
  completionRate: number;      // completionCount / assignedCount, 0 when assignedCount = 0
  averageScore: number | null; // average of Result.percentage across COMPLETED + COMPLETED_PENDING_REVIEW; null if completionCount = 0
}
```

## 8. JSON examples

### 8.1 Valid — mixed states within one quiz

```json
{
  "quizId": "quiz-analytics-demo",
  "quizTitle": "Analytics Demo Quiz",
  "windowClosed": true,
  "assignedCount": 5,
  "participationCount": 4,
  "completionCount": 2,
  "absenceCount": 1,
  "followUpCount": 1,
  "participationRate": 0.8,
  "completionRate": 0.4,
  "averageScore": 76.5
}
```

### 8.2 Valid — per-student breakdown for the same quiz

```json
[
  {
    "studentId": "student-complete",
    "studentName": "Complete Student",
    "quizId": "quiz-analytics-demo",
    "status": "COMPLETED",
    "score": 8,
    "maxScore": 10,
    "percentage": 80,
    "attemptId": "attempt-complete",
    "startedAt": "2026-08-01T09:00:00.000Z",
    "submittedAt": "2026-08-01T09:22:00.000Z",
    "followUpRequired": false,
    "pendingEssayCount": 0
  },
  {
    "studentId": "student-followup",
    "studentName": "Pending Review Student",
    "quizId": "quiz-analytics-demo",
    "status": "COMPLETED_PENDING_REVIEW",
    "score": 7,
    "maxScore": 10,
    "percentage": 70,
    "attemptId": "attempt-followup",
    "startedAt": "2026-08-01T09:05:00.000Z",
    "submittedAt": "2026-08-01T09:30:00.000Z",
    "followUpRequired": true,
    "pendingEssayCount": 1
  },
  {
    "studentId": "student-notcompleted",
    "studentName": "Timed Out Student",
    "quizId": "quiz-analytics-demo",
    "status": "PARTICIPATED_NOT_COMPLETED",
    "score": null,
    "maxScore": null,
    "percentage": null,
    "attemptId": "attempt-timedout",
    "startedAt": "2026-08-01T09:10:00.000Z",
    "submittedAt": null,
    "followUpRequired": false,
    "pendingEssayCount": 0
  },
  {
    "studentId": "student-absent",
    "studentName": "Absent Student",
    "quizId": "quiz-analytics-demo",
    "status": "ABSENT",
    "score": null,
    "maxScore": null,
    "percentage": null,
    "attemptId": null,
    "startedAt": null,
    "submittedAt": null,
    "followUpRequired": false,
    "pendingEssayCount": 0
  },
  {
    "studentId": "student-notstarted",
    "studentName": "Not Started Student",
    "quizId": "quiz-analytics-demo-open",
    "status": "NOT_STARTED",
    "score": null,
    "maxScore": null,
    "percentage": null,
    "attemptId": null,
    "startedAt": null,
    "submittedAt": null,
    "followUpRequired": false,
    "pendingEssayCount": 0
  }
]
```

### 8.3 Edge case — zero assignment (out of scope, not zero-state)

A quiz with no assigned students at all has all counts at zero, but this is **not** an absence or empty-state scenario — it is simply a quiz nobody has been invited to yet. `absenceCount` must stay `0` here, not be conflated with participation failure:

```json
{
  "quizId": "quiz-unassigned-demo",
  "quizTitle": "Unassigned Demo Quiz",
  "windowClosed": false,
  "assignedCount": 0,
  "participationCount": 0,
  "completionCount": 0,
  "absenceCount": 0,
  "followUpCount": 0,
  "participationRate": 0,
  "completionRate": 0,
  "averageScore": null
}
```

## 9. Validation rules

- `status` must be one of the six enumerated values in §6 — no ad hoc strings.
- `score`, `maxScore`, `percentage` must all be `null` together, or all be non-null together — never a partial mix.
- `absenceCount` on a `QuizMetricSummary` must be `0` whenever `windowClosed` is `false` (see §5).
- `participationRate` and `completionRate` must be `0` (not `NaN` or `null`) when `assignedCount` is `0`.
- `followUpRequired: true` requires `pendingEssayCount > 0`; the two fields must never disagree.

## 10. Dependencies on other modules

- `PrismaModule` — source of truth for `Quiz`, `Attempt`, `Result`, `StudentProfile`.
- `AttemptModule` / scoring service — populates `Attempt.status` and `Result` after submission.
- `AnalyticsGradingModule` (`analytics-grading.service.ts`) — resolves `Result.gradingStatus` from `PARTIAL` to `COMPLETE` once essay grading finishes; follow-up count is only accurate as of the last grading action.

## 11. Open questions (carried over / new)

- Should `ABSENT` students be surfaced identically to `NOT_STARTED` in the UI with a visual distinction, or fully separated sections? (Product decision, not a data-contract concern, but flagged here for handover.)
- Does `windowClosed` need a grace period (e.g. quizzes closed within the last N minutes still show as `NOT_STARTED` while late submissions are processed)? Not currently modeled — assumed instantaneous cutoff at `endsAt`.
- Should follow-up tracking extend to flagged `CheatingEventLog` entries requiring review, in addition to pending essay grading? Out of scope for this contract; only essay-grading follow-up is defined here.

## 12. Handover notes (Sprint 1 → Sprint 2)

- **Sprint 1** shipped this contract as vocabulary and payload shape only, plus `getAnalytics()` and `getQuizAttempts()` — neither of which returned the `status` enum or `ABSENT`/`COMPLETED_PENDING_REVIEW` distinctions defined above.
- **Sprint 2** implemented the contract: `AnalyticsService.getStudentQuizMetrics(quizId)` and `getQuizMetricSummary(quizId)` match §6/§7 exactly, and a new `getDashboardMetrics()` aggregates every quiz into one org-wide payload (`GET /analytics/dashboard`) — see §13 for the endpoint list and §14 for the score-distribution and empty-state rules that endpoint adds. `getAnalytics()` and `getQuizAttempts()` remain unchanged for backward compatibility with any existing callers.
- `prisma/seeds/analytics-mock.ts` (companion to this document) seeds one quiz covering all five states plus the zero-assignment edge case; it is the fixture used by both the Sprint 1 payload examples in §8 and the Sprint 2 automated tests in `backend/test/analytics/`.
- Sprint 2 also added a Learner Follow-Up Engine (`FollowUpModule`) built directly on `getStudentQuizMetrics()` rather than re-deriving status — see §15.

## 13. Shipped endpoints (Sprint 2)

All routes below are admin-only (`JwtAuthGuard` + `RolesGuard` + `@Roles(UserRole.ADMIN)`) and mounted under the global `/api` prefix.

| Method | Path | Returns | Notes |
|---|---|---|---|
| GET | `/analytics` | `DashboardSummaryDto` | Sprint 1 org-wide counts (kept for backward compatibility) |
| GET | `/analytics/dashboard` | `DashboardMetricsDto` | **New.** Live org-wide participation/completion/absence/follow-up + score distribution, aggregated across every quiz. §14 |
| GET | `/analytics/quizzes/:quizTitle/attempts` | `QuizAttemptsResponseDto` | Sprint 1 per-quiz attempt list (kept for backward compatibility) |
| GET | `/analytics/quizzes/:quizId/metrics` | `QuizMetricSummaryDto` | Implements §7 for one quiz |
| GET | `/analytics/quizzes/:quizId/student-metrics` | `StudentQuizMetricDto[]` | Implements §6 for one quiz |
| GET | `/analytics/events` (SSE) | `MessageEvent` stream | Live-update channel, unrelated to the metrics above |
| GET | `/follow-up` | `FollowUpSummaryDto` | **New.** Org-wide learner follow-up queue, categorized. §15 |
| GET | `/follow-up/quizzes/:quizId` | `FollowUpSummaryDto` | **New.** Follow-up queue scoped to one quiz |

## 14. Payload schema — org-wide dashboard metrics (`GET /analytics/dashboard`)

```typescript
interface DashboardMetricsDto {
  totalQuizzes: number;
  distinctStudentCount: number;      // unique students across all quizzes (not summed per-quiz)
  assignedCount: number;             // sum of each quiz's assignedCount
  participationCount: number;
  completionCount: number;
  absenceCount: number;
  followUpCount: number;
  participationRate: number;         // 0 when assignedCount = 0, never NaN
  completionRate: number;            // 0 when assignedCount = 0, never NaN
  averageScore: number | null;       // null when nobody has completed anything yet
  scoreDistribution: { range: '0-20' | '21-40' | '41-60' | '61-80' | '81-100'; count: number }[];
  quizzes: QuizMetricSummary[];      // §7 shape, one entry per quiz
}
```

**Empty-cohort rule:** with zero quizzes in the database, every count is a real `0`, `averageScore` is `null` (never `NaN`), and `scoreDistribution` still contains all five buckets at `count: 0` — the frontend renders this as an explicit "no data yet" state rather than a chart with missing bars or a `0%` that looks like a real rate. This is the same empty-state discipline as §4/§5, applied at the org-wide level.

**Score-distribution buckets** are half-open intervals — `[0,20)`, `[20,40)`, `[40,60)`, `[60,80)`, `[80,100]` — computed from `Result.percentage` across all `COMPLETED` + `COMPLETED_PENDING_REVIEW` students. Half-open (rather than parsing the label text) means a fractional percentage such as `43.33` lands in exactly one bucket instead of matching neither `41-60` label boundary.

## 15. Learner Follow-Up Engine (Sprint 2)

The Follow-Up Engine turns the per-student `status` from §6 into an actionable, categorized queue for admins — it does not introduce new status logic; every category below is a deterministic function of `StudentQuizMetric.status` (plus quiz metadata: `passingScore`, `endsAt`, and the in-progress attempt's `expiresAt`), so the follow-up queue and the per-student metrics endpoint can never disagree on why a student is or isn't flagged.

### 15.1 Categories

| Category | Trigger | Recommended action |
|---|---|---|
| `PENDING_ESSAY_REVIEW` | `status = COMPLETED_PENDING_REVIEW` | Grade the pending essay response(s) to finalize the score |
| `AT_RISK_LOW_SCORE` | `status = COMPLETED` and `percentage < quiz.passingScore` (default 60 if unset) | Reach out with remediation resources or offer a retake |
| `STALLED_IN_PROGRESS` | `status = IN_PROGRESS` and the attempt's `expiresAt` is already in the past | Investigate the stalled attempt and manually finalize or reset it |
| `ABANDONED_NOT_COMPLETED` | `status = PARTICIPATED_NOT_COMPLETED` (`TIMED_OUT` or `ABANDONED`) | Contact the student to check for technical issues and offer a makeup attempt |
| `ABSENT_NO_SHOW` | `status = ABSENT` | Escalate the absence and schedule a makeup session |
| `NOT_STARTED_CLOSING_SOON` | `status = NOT_STARTED` and `quiz.endsAt` is within the next 24 hours | Send an urgent reminder before the window closes |

A student can only ever land in one category per quiz — categories are checked in the priority order above (e.g. a `COMPLETED_PENDING_REVIEW` student is always `PENDING_ESSAY_REVIEW`, never re-evaluated against the score threshold, since grading it is the actionable next step). `COMPLETED` students above the passing threshold, `NOT_STARTED` students with more than 24h left, and actively progressing `IN_PROGRESS` students within their time window require no follow-up and are not queued.

### 15.2 Payload schema

```typescript
interface FollowUpEntryDto {
  studentId: string;
  studentName: string;
  quizId: string;
  quizTitle: string;
  category: FollowUpCategory;
  reason: string;               // human-readable trigger explanation
  recommendedAction: string;
  status: StudentQuizStatus;    // §6 status this was derived from
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  pendingEssayCount: number;
  attemptId: string | null;
}

interface FollowUpCategoryGroupDto {
  category: FollowUpCategory;
  label: string;
  description: string;
  count: number;
  entries: FollowUpEntryDto[];
}

interface FollowUpSummaryDto {
  totalFollowUps: number;
  categories: FollowUpCategoryGroupDto[]; // always all 6 categories, even at count 0
}
```

**Empty-cohort rule:** with zero quizzes (or zero students needing follow-up), `totalFollowUps` is `0` and `categories` still contains all 6 category groups at `count: 0` with empty `entries` arrays — same "always show the full shape, never omit a bucket" discipline as §14's score distribution.