import { QuizAttemptDto } from './quiz-attempt.dto';

export interface QuizAttemptsResponseDto {
  quizId: string;

  quizTitle: string;

  attemptCount: number;

  attempts: QuizAttemptDto[];
}