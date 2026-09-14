// DTOs implementing the payload schemas defined in
// docs/analytics-contract.md §6 and §7. Kept separate from the existing
// quiz-attempt.dto.ts / dashboard-summary.dto.ts to avoid changing the
// response shape of the already-shipped getAnalytics()/getQuizAttempts()
// endpoints.

export type StudentQuizStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'COMPLETED_PENDING_REVIEW'
  | 'PARTICIPATED_NOT_COMPLETED'
  | 'ABSENT';

export interface StudentQuizMetricDto {
  studentId: string;

  studentName: string;

  quizId: string;

  status: StudentQuizStatus;

  score: number | null;

  maxScore: number | null;

  percentage: number | null;

  attemptId: string | null;

  startedAt: Date | null;

  submittedAt: Date | null;

  followUpRequired: boolean;

  pendingEssayCount: number;
}

export interface QuizMetricSummaryDto {
  quizId: string;

  quizTitle: string;

  windowClosed: boolean;

  assignedCount: number;

  participationCount: number;

  completionCount: number;

  absenceCount: number;

  followUpCount: number;

  participationRate: number;

  completionRate: number;

  averageScore: number | null;
}

// Fixed bucket labels so the frontend always renders all five ranges,
// even at count 0 — this is what makes an empty cohort look like "no
// data yet" instead of a chart with missing bars.
export const SCORE_DISTRIBUTION_RANGES = [
  '0-20',
  '21-40',
  '41-60',
  '61-80',
  '81-100',
] as const;

export type ScoreDistributionRange = (typeof SCORE_DISTRIBUTION_RANGES)[number];

export interface ScoreDistributionBucketDto {
  range: ScoreDistributionRange;

  count: number;
}

// Org-wide dashboard summary implementing the Sprint 2 brief: live
// aggregations across every quiz, not a single quiz. assignedCount,
// participationCount, completionCount, absenceCount, and followUpCount
// here are SUMS of the per-quiz values in `quizzes` below (i.e. a
// student assigned to 3 quizzes contributes 3 to assignedCount) — this
// keeps the org-wide rate calculations consistent with the per-quiz
// ones a reviewer can cross-check by hand. distinctStudentCount is
// provided separately for "how many people" context.
export interface DashboardMetricsDto {
  totalQuizzes: number;

  distinctStudentCount: number;

  assignedCount: number;

  participationCount: number;

  completionCount: number;

  absenceCount: number;

  followUpCount: number;

  participationRate: number;

  completionRate: number;

  averageScore: number | null;

  scoreDistribution: ScoreDistributionBucketDto[];

  quizzes: QuizMetricSummaryDto[];
}