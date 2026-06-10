import { QuizAttemptDto } from './quiz-attempt.dto';

export interface QuizAttemptsResponseDto {
  quizId: number;

  quizTitle: string;

  attemptCount: number;

  attempts: QuizAttemptDto[];
}