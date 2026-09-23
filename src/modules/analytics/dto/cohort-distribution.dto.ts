// DTOs for GET /analytics/cohorts/distribution and the CSV export that
// shares its filters. Formulas documented in
// docs/analytics-calculations.md §2.

import { ScoreDistributionBucketDto } from './quiz-metric.dto';

export interface CohortStudentStandingDto {
  studentId: string;
  studentName: string;
  cohort: string | null;
  quizId: string;
  quizTitle: string;
  score: number;
  maxScore: number;
  percentage: number;
  submittedAt: Date;

  /// Standard competition ranking (1224 style): rank = 1 + count of
  /// students in the filtered set with a strictly higher percentage.
  /// Ties share a rank; the next rank after a tie skips ahead.
  rank: number;

  /// (count of students strictly below this one / total students) * 100,
  /// rounded to 2 decimals. "What percentage of the cohort this student
  /// outscored." 100 when this student is the sole result.
  percentile: number;
}

export interface CohortDistributionDto {
  totalCompletedAttempts: number;
  averagePercentage: number | null;
  medianPercentage: number | null;
  /// Population standard deviation (divides by N, not N-1) — the filtered
  /// set IS the whole population being reported on, not a sample of it.
  standardDeviationPercentage: number | null;
  scoreDistribution: ScoreDistributionBucketDto[];
  /// Sorted by rank ascending (highest scorer first).
  standings: CohortStudentStandingDto[];
}
