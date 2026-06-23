import { QuizAttemptDto, QuizStudentScoreDto } from './quiz-attempt.dto';

export interface QuizAttemptsResponseDto {
  quizId: string;

  quizTitle: string;

  attemptCount: number;

  completionCount: number;

  averageScore: number;

  statusBreakdown: {
    notStarted: number;
    inProgress: number;
    submitted: number;
  };

  attempts: QuizAttemptDto[];

  studentScores: QuizStudentScoreDto[];
}