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