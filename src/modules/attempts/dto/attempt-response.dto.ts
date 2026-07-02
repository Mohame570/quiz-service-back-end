// src/modules/attempts/dto/attempt-response.dto.ts
//
// These DTOs define the API contract consumed by:
//   - L4 (Student solving flow)  — AttemptResponseDto
//   - L6 (Analytics)             — AttemptSummaryDto
//
// Keep field names stable; notify affected owners before renaming.

import { AttemptStatus } from '../../../generated/prisma/client';

export class AttemptAnswerResponseDto {
  id!: string;
  attemptId!: string;
  questionId!: string;
  selectedOptionId!: string | null;
  textAnswer!: string | null;
  isCorrect!: boolean | null;
  answeredAt!: Date;
}

/// Full representation — returned by GET /attempts/:id and POST /attempts/:id/submit
export class AttemptResponseDto {
  id!: string;
  quizId!: string;
  studentId!: string;
  startedAt!: Date;
  submittedAt!: Date | null;
  status!: AttemptStatus;
  score!: number | null;
  maxScore!: number | null;
  createdAt!: Date;
  updatedAt!: Date;
  answers!: AttemptAnswerResponseDto[];
}

/// Lightweight — returned by GET /attempts (list) and consumed by analytics
export class AttemptSummaryDto {
  id!: string;
  quizId!: string;
  studentId!: string;
  startedAt!: Date;
  submittedAt!: Date | null;
  status!: AttemptStatus;
  score!: number | null;
  maxScore!: number | null;
}
