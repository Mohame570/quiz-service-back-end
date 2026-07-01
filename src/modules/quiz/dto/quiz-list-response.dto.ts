import { Quiz } from '../../../generated/prisma/client';

export class QuizListResponseDto {
  quizzes!: Quiz[];
  page!: number;
  pageSize!: number;
  totalItems!: number;
  totalPages!: number;
  hasNextPage!: boolean;
  hasPreviousPage!: boolean;
}
