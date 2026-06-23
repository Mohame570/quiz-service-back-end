import { QuestionType } from '../../../generated/prisma/client';

export class StudentAttemptQuestionDto {
  id!: string;
  type!: QuestionType;
  text!: string;
  options!: string[];
  order!: number;
}
