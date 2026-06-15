import { StudentQuizListItemDto } from './student-quiz-list-item.dto';

export class StudentQuizInstructionsDto extends StudentQuizListItemDto {
  canStart!: boolean;
  reasonIfBlocked!: string | null;
}
