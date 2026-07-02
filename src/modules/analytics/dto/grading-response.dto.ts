import { AttemptStatus, GradingStatus } from '../../../generated/prisma/client';

export class GradingAttemptSummaryDto {
  attemptId!: string;
  quizId!: string;
  quizTitle!: string;
  studentEmail!: string;
  studentName!: string | null;
  submittedAt!: Date | null;
  pendingEssayCount!: number;
  currentScore!: number;
  maxScore!: number;
}

export class GradingQueueResponseDto {
  items!: GradingAttemptSummaryDto[];
}

export class GradingAttemptAnswerDto {
  id!: string;
  questionId!: string;
  questionType!: string;
  questionText!: string;
  maxPoints!: number;
  selectedOptionId!: string | null;
  textAnswer!: string | null;
  pointsEarned!: number | null;
  isCorrect!: boolean | null;
  gradedAt!: Date | null;
  answeredAt!: Date;
  pendingManualGrade!: boolean;
}

export class GradingAttemptResultDto {
  percentage!: number;
  passed!: boolean | null;
  gradingStatus!: GradingStatus;
  pendingEssayCount!: number;
  gradedAt!: Date;
}

export class GradingAttemptDetailDto {
  attemptId!: string;
  quizId!: string;
  quizTitle!: string;
  passingScore!: number | null;
  studentEmail!: string;
  studentName!: string | null;
  status!: AttemptStatus;
  submittedAt!: Date | null;
  score!: number | null;
  maxScore!: number | null;
  result!: GradingAttemptResultDto | null;
  answers!: GradingAttemptAnswerDto[];
}
