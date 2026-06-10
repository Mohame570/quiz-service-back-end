export interface QuizAttemptDto {
  attemptId: number;

  studentName: string;

  score: number;

  submittedAt: Date;
}