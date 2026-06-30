import { Quiz } from '../../../generated/prisma/client';

export class QuizListResponseDto {
  items: Quiz[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}
