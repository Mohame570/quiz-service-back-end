import { Injectable } from '@nestjs/common';

import { AttemptsService } from '../../attempts/services/attempts.service';
import {
  AttemptAnswerResponseDto,
  AttemptResponseDto,
} from '../../attempts/dto';
import { SaveAnswerItemDto } from '../../attempts/dto/save-answers.dto';
import { QuestionsService } from '../../questions/services/questions.service';

@Injectable()
export class StudentAttemptOrchestrator {
  constructor(
    private readonly attempts: AttemptsService,
    private readonly questions: QuestionsService,
  ) {}

  startAttempt(quizId: string, studentId: string): Promise<AttemptResponseDto> {
    return this.attempts.start(quizId, studentId);
  }

  saveAnswers(
    attemptId: string,
    studentId: string,
    items: SaveAnswerItemDto[],
  ): Promise<AttemptAnswerResponseDto[]> {
    return this.attempts.saveAnswers(attemptId, studentId, items);
  }

  submit(
    attemptId: string,
    studentId: string,
    items: SaveAnswerItemDto[],
  ): Promise<AttemptResponseDto> {
    return this.attempts.submit(attemptId, studentId, items);
  }

  getResult(attemptId: string, studentId: string): Promise<AttemptResponseDto> {
    return this.attempts.getResult(attemptId, studentId);
  }

  listQuizQuestions(quizId: string) {
    return this.questions.findByQuiz(quizId);
  }
}
