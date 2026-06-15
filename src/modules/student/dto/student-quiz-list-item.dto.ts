import { AttemptStatus } from '../../../generated/prisma/client';

export type StudentAttemptStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'TIMED_OUT';

export class StudentQuizListItemDto {
  id!: string;
  title!: string;
  description!: string | null;
  durationMinutes!: number | null;
  passingScore!: number | null;
  startsAt!: Date | null;
  endsAt!: Date | null;
  questionCount!: number;
  attemptStatus!: StudentAttemptStatus;
  attemptId!: string | null;
}

export const ATTEMPT_STATUS_PRIORITY: Record<StudentAttemptStatus, number> = {
  SUBMITTED: 3,
  TIMED_OUT: 2,
  IN_PROGRESS: 1,
  NOT_STARTED: 0,
};

export function deriveAttemptStatus(
  attempts: { status: AttemptStatus }[],
): StudentAttemptStatus {
  if (attempts.length === 0) {
    return 'NOT_STARTED';
  }

  let best: StudentAttemptStatus = 'NOT_STARTED';
  let bestPriority = -1;

  for (const attempt of attempts) {
    const candidate: StudentAttemptStatus = mapAttemptStatus(attempt.status);
    const priority = ATTEMPT_STATUS_PRIORITY[candidate];
    if (priority > bestPriority) {
      best = candidate;
      bestPriority = priority;
    }
  }

  return best;
}

export function mapAttemptStatus(status: AttemptStatus): StudentAttemptStatus {
  switch (status) {
    case AttemptStatus.IN_PROGRESS:
      return 'IN_PROGRESS';
    case AttemptStatus.SUBMITTED:
      return 'SUBMITTED';
    case AttemptStatus.TIMED_OUT:
      return 'TIMED_OUT';
    case AttemptStatus.ABANDONED:
      return 'NOT_STARTED';
    default:
      return 'NOT_STARTED';
  }
}
