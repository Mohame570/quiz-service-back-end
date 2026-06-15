export class StudentActiveAttemptDto {
  attemptId!: string;
  quizId!: string;
  startedAt!: Date;
  expiresAt!: Date | null;
}

export class StudentActiveAttemptResponseDto {
  attempt!: StudentActiveAttemptDto | null;
}
