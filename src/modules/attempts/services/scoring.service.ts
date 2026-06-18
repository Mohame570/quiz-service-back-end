// src/modules/attempts/services/scoring.service.ts
//
// Real, runnable auto-scoring against this repo's actual schema.
//
// Source of truth for "what is correct": Question.correctAnswer (a plain
// string — either "True"/"False" for TRUE_FALSE, or one of Question.options
// for MCQ). There is no separate Option table in this schema, so the
// comparison is a direct string match between AttemptAnswer.selectedOptionId
// and Question.correctAnswer.
//
// Note on naming: AttemptAnswer.selectedOptionId is misleadingly named —
// it actually stores the literal answer text the student picked (see
// save-answers.dto.ts, which validates it with @IsString()), not a
// relational ID. This service treats it as such.

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AttemptResponseDto } from '../dto/attempt-response.dto';

export interface ScoringResult {
  score: number;
  maxScore: number;
  percentage: number;
}

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  constructor(private readonly prisma: PrismaService) {}

  // -----------------------------------------------------------------------
  // Main entry point — called by AttemptsService.submit()
  // -----------------------------------------------------------------------

  async scoreAttempt(attemptId: string): Promise<AttemptResponseDto> {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: { answers: true },
    });

    if (!attempt) throw new NotFoundException('Attempt not found.');

    const answers = attempt.answers;

    if (answers.length === 0) {
      await this.prisma.attempt.update({
        where: { id: attemptId },
        data: { score: 0, maxScore: 0 },
      });
      return this.toResponseDto({ ...attempt, score: 0, maxScore: 0 });
    }

    // 1. Load the real correct answer for every question in this attempt.
    const questionIds = answers.map((a) => a.questionId);
    const questions = await this.prisma.question.findMany({
      where: { id: { in: questionIds } },
      select: { id: true, correctAnswer: true },
    });
    const correctAnswerMap = new Map(questions.map((q) => [q.id, q.correctAnswer]));

    // 2. Compare each submitted answer's text against the question's
    //    correctAnswer. This is the actual comparison.
    const graded = answers.map((answer) => {
      const correctAnswer = correctAnswerMap.get(answer.questionId);
      const isCorrect = this.compareAnswer(answer.selectedOptionId, correctAnswer);
      return { answerId: answer.id, isCorrect, hasKey: correctAnswer !== undefined };
    });

    const score = graded.filter((g) => g.isCorrect === true).length;
    const maxScore = graded.filter((g) => g.hasKey).length;

    // 3. Persist isCorrect per answer + score/maxScore on the attempt,
    //    all in one transaction.
    await this.prisma.$transaction([
      ...graded.map((g) =>
        this.prisma.attemptAnswer.update({
          where: { id: g.answerId },
          data: { isCorrect: g.isCorrect },
        }),
      ),
      this.prisma.attempt.update({
        where: { id: attemptId },
        data: { score, maxScore },
      }),
    ]);

    this.logger.log(`Attempt ${attemptId} scored: ${score}/${maxScore}`);

    const scored = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: { answers: true },
    });

    return this.toResponseDto(scored);
  }

  // -----------------------------------------------------------------------
  // The actual comparison.
  //   - selected === correctAnswer        -> true
  //   - selected exists but !== correct   -> false
  //   - selected is null (skipped)        -> false
  //   - question has no correctAnswer on file -> null (ungraded)
  //
  // Comparison is case-sensitive and exact-match, matching how
  // Question.correctAnswer is validated on creation (IsValidCorrectAnswerConstraint
  // checks for an exact string match against options, or "True"/"False").
  // -----------------------------------------------------------------------

  compareAnswer(
    selectedOptionId: string | null,
    correctAnswer: string | undefined,
  ): boolean | null {
    if (correctAnswer === undefined) return null;
    return selectedOptionId !== null && selectedOptionId === correctAnswer;
  }

  // -----------------------------------------------------------------------
  // Deterministic percentage — same input always gives same output.
  // -----------------------------------------------------------------------

  computePercentage(score: number, maxScore: number): number {
    if (maxScore === 0) return 0;
    return Math.round((score / maxScore) * 100 * 100) / 100;
  }

  private toResponseDto(attempt: any): AttemptResponseDto {
    return {
      id: attempt.id,
      quizId: attempt.quizId,
      studentId: attempt.studentId,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      status: attempt.status,
      score: attempt.score,
      maxScore: attempt.maxScore,
      createdAt: attempt.createdAt,
      updatedAt: attempt.updatedAt,
      answers: (attempt.answers ?? []).map((a: any) => ({
        id: a.id,
        attemptId: a.attemptId,
        questionId: a.questionId,
        selectedOptionId: a.selectedOptionId,
        isCorrect: a.isCorrect,
        answeredAt: a.answeredAt,
      })),
    };
  }
}
