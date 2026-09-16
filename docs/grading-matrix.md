# Grading Matrix — PitIQ

This document is the single source of truth for scoring. The backend `ScoringService` implements exactly the rules below.

## Supported Types

| Type | Input | Correctness Rule | Points |
|------|-------|------------------|--------|
| **MCQ** | `selectedOptionId` (single) | `selected === correctAnswer` | `points` if true else `0` |
| **TRUE_FALSE** | `selectedOptionId` in `['True','False']` | `selected === correctAnswer` | `points` if true else `0` |
| **SHORT_TEXT** | `textAnswer` (string) | `normalize(textAnswer) === normalize(correctAnswer)` (trim, lowercase, collapse spaces) | `points` if true else `0` |
| **ESSAY** | `textAnswer` | `hasText ? pending : incorrect` — requires manual grading | `null` if hasText (PARTIAL), `0` if empty |
| **MULTI_SELECT** | `selectedOptionIds: string[]` | **Exact set match**: `selected.length >0 && selected.length===correct.length && every selected ∈ correct && every correct ∈ selected` | `points` if true else `0` |

## MULTI_SELECT Details
- Authoring: `options: string[]` (≥2, unique), `correctAnswers: string[]` (≥1, unique, subset of `options`)
- Solving: checkboxes → `selectedOptionIds`
- Scoring: deterministic, no partial credit. Examples:
  - `correct=[A,C]`, `selected=[A,C]` → **correct (1)**
  - `selected=[A]` → **incorrect (0)** (missing C)
  - `selected=[A,C,B]` → **incorrect (0)** (extra B)
  - `selected=[]` → **incorrect (0)**

## Snapshot Immutability
On `POST /attempts/:id/submit` the service runs a transaction that copies `text, options, correctAnswer, correctAnswers, type, points` from `Question` into `AttemptAnswer.snapshot*` fields. Grading thereafter uses the snapshot, not the live `Question`, so editing a bank question does not alter past attempt scores.

## Aggregation
- `score = Σ pointsEarned` (where `pointsEarned !== null`)
- `maxScore = Σ question.points` for quiz
- `percentage = round(score/maxScore*100, 2)`
- `gradingStatus = PENDING_ESSAY_COUNT>0 ? PARTIAL : COMPLETE`
- `passed = gradingStatus===COMPLETE ? percentage >= passingScore : null`

# Grading Matrix

| Type | Rule | Points |
|------|------|--------|
| MCQ | 1 لو selected === correct | 1 أو 0 |
| TRUE_FALSE | 1 لو صح | 1 أو 0 |
| SHORT_TEXT | 1 لو normalized text === correct | 1 أو 0 |
| MULTI_SELECT | 1 لو selectedSet === correctSet بالظبط (كل الصح ولا غلط) | 1 أو 0 |
| ESSAY | pending manual | null |

## References
- `src/modules/attempts/services/scoring.service.ts: gradeAnswer()` — implements this matrix
- `src/modules/attempts/services/attempts.service.ts: submit()` — snapshot transaction
- `src/modules/questions/dto/create-question.dto.ts` — validates `correctAnswers` for MULTI_SELECT
