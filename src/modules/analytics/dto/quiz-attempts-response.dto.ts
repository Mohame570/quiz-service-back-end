import { QuizAttemptDto } from './quiz-attempt.dto';

export interface QuizAttemptsResponseDto {

  quizTitle: string;

  attemptCount: number;

  attempts: QuizAttemptDto[];
}