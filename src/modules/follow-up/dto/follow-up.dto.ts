// DTOs implementing docs/analytics-contract.md §15 — the Learner
// Follow-Up Engine. Deliberately built on top of StudentQuizStatus from
// analytics/dto/quiz-metric.dto.ts rather than re-deriving status logic,
// so this queue and the per-student metrics endpoint can never disagree
// on why a student is (or isn't) flagged.

import { StudentQuizStatus } from '../../analytics/dto/quiz-metric.dto';

export enum FollowUpCategory {
  PENDING_ESSAY_REVIEW = 'PENDING_ESSAY_REVIEW',
  AT_RISK_LOW_SCORE = 'AT_RISK_LOW_SCORE',
  STALLED_IN_PROGRESS = 'STALLED_IN_PROGRESS',
  ABANDONED_NOT_COMPLETED = 'ABANDONED_NOT_COMPLETED',
  ABSENT_NO_SHOW = 'ABSENT_NO_SHOW',
  NOT_STARTED_CLOSING_SOON = 'NOT_STARTED_CLOSING_SOON',
}

// Fixed metadata for every category, in priority/check order. Iterating
// this array (rather than only the categories that happen to have
// entries) is what makes an empty cohort return all six groups at
// count 0 instead of an empty list — the same "always show the full
// shape" rule as SCORE_DISTRIBUTION_RANGES in quiz-metric.dto.ts.
export const FOLLOW_UP_CATEGORY_META: ReadonlyArray<{
  category: FollowUpCategory;
  label: string;
  description: string;
}> = [
  {
    category: FollowUpCategory.PENDING_ESSAY_REVIEW,
    label: 'Pending essay review',
    description: 'Submitted, but one or more essay answers are still awaiting manual grading.',
  },
  {
    category: FollowUpCategory.AT_RISK_LOW_SCORE,
    label: 'At risk — low score',
    description: 'Completed the quiz but scored below the passing threshold.',
  },
  {
    category: FollowUpCategory.STALLED_IN_PROGRESS,
    label: 'Stalled in progress',
    description: "Attempt window has expired but was never finalized as submitted or timed out.",
  },
  {
    category: FollowUpCategory.ABANDONED_NOT_COMPLETED,
    label: 'Abandoned / not completed',
    description: 'Started the attempt but it timed out or was abandoned before submission.',
  },
  {
    category: FollowUpCategory.ABSENT_NO_SHOW,
    label: 'Absent — no show',
    description: 'Assigned to the quiz but never attempted it before the window closed.',
  },
  {
    category: FollowUpCategory.NOT_STARTED_CLOSING_SOON,
    label: 'Not started — closing soon',
    description: 'Has not started yet and the response window closes within 24 hours.',
  },
];

export interface FollowUpEntryDto {
  studentId: string;
  studentName: string;
  quizId: string;
  quizTitle: string;
  category: FollowUpCategory;
  reason: string;
  recommendedAction: string;
  status: StudentQuizStatus;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  pendingEssayCount: number;
  attemptId: string | null;
}

export interface FollowUpCategoryGroupDto {
  category: FollowUpCategory;
  label: string;
  description: string;
  count: number;
  entries: FollowUpEntryDto[];
}

export interface FollowUpSummaryDto {
  totalFollowUps: number;
  categories: FollowUpCategoryGroupDto[];
}
