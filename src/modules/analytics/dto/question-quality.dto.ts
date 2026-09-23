// DTOs for GET /analytics/questions/quality.
// Formulas documented in docs/analytics-calculations.md §1.

export interface QuestionQualityMetricDto {
  questionId: string;
  questionText: string;
  quizId: string;
  quizTitle: string;

  /// Denominator for every rate below: finalized attempts (SUBMITTED or
  /// TIMED_OUT) on this question's quiz. Snapshot-safe — this and every
  /// count below come only from persisted AttemptAnswer.isCorrect /
  /// Attempt.status, never from re-joining the live Question.correctAnswer,
  /// so editing a question after students have answered it can never
  /// retroactively change historical quality metrics.
  totalFinalizedAttempts: number;

  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  /// Essay/short-text answers submitted but not yet graded — excluded from
  /// correct/wrong, reported separately for transparency.
  pendingGradingCount: number;

  correctRate: number;
  wrongRate: number;
  skippedRate: number;
  pendingGradingRate: number;

  /// wrongCount / (correctCount + wrongCount) — error rate among students
  /// who actually attempted the question (excludes skips and pending
  /// grading from the denominator). Distinguishes "confusing" (attempted
  /// often, gotten wrong often) from "hard" (mostly skipped).
  confusionScore: number | null;
}

export interface QuestionQualitySummaryDto {
  totalQuestions: number;
  /// Sorted per docs/analytics-calculations.md §1.3: correctRate ascending
  /// (hardest first), confusionScore descending as tiebreaker.
  questions: QuestionQualityMetricDto[];
}
