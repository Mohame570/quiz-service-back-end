import { StudentAttemptQuestionDto } from './student-attempt-question.dto';

export class StudentAttemptQuestionsResponseDto {
  attemptId!: string;
  quizId!: string;
  expiresAt!: Date;
  remainingSeconds!: number;
  questions!: StudentAttemptQuestionDto[];
}
