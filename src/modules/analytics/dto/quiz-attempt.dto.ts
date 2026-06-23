export interface QuizAttemptDto {
  attemptId: string;

  studentName: string;

  score: number;

  submittedAt: Date;
}

export interface QuizStudentScoreDto {
  studentId: string;

  studentName: string;

  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED';

  score: number | null;

  attemptId: string | null;

  startedAt: Date | null;

  submittedAt: Date | null;
}