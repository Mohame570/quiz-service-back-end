// src/modules/attempts/services/scoring.service.ts

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AttemptResponseDto } from '../dto/attempt-response.dto';

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  constructor(private readonly prisma: PrismaService) {}

  async scoreAttempt(attemptId: string): Promise<AttemptResponseDto> {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: { answers: true },
    });

    if (!attempt) throw new NotFoundException('Attempt not found.');

    const answers = attempt.answers;

    if (answers.length === 0) {
      await this.prisma.$transaction([
        this.prisma.attempt.update({
          where: { id: attemptId },
          data: { score: 0, maxScore: 0 },
        }),
        this.prisma.result.upsert({
          where: { attemptId },
          create: {
            attemptId,
            studentId: attempt.studentId,
            quizId: attempt.quizId,
            score: 0,
            maxScore: 0,
            percentage: 0,
            passed: false,
            gradedAt: new Date(),
          },
          update: {
            score: 0,
            maxScore: 0,
            percentage: 0,
            passed: false,
            gradedAt: new Date(),
          },
        }),
      ]);
      return this.toResponseDto({ ...attempt, score: 0, maxScore: 0 });
    }

    // Load correct answers from Question table
    const questionIds = answers.map((a) => a.questionId);
    const questions = await this.prisma.question.findMany({
      where: { id: { in: questionIds } },
      select: { id: true, correctAnswer: true },
    });
    const correctAnswerMap = new Map(questions.map((q) => [q.id, q.correctAnswer]));

    // Grade each answer
    const graded = answers.map((answer) => {
      const correctAnswer = correctAnswerMap.get(answer.questionId);
      const isCorrect = this.compareAnswer(answer.selectedOptionId, correctAnswer);
      return { answerId: answer.id, isCorrect, hasKey: correctAnswer !== undefined };
    });

    const score = graded.filter((g) => g.isCorrect === true).length;
    const maxScore = graded.filter((g) => g.hasKey).length;
    const percentage = this.computePercentage(score, maxScore);

    // Determine pass/fail — default passing threshold is 50%
    // This can be driven by Quiz.passingScore once that field is used
    const passingThreshold = 50;
    const passed = percentage >= passingThreshold;

    // Persist everything atomically
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
      this.prisma.result.upsert({
        where: { attemptId },
        create: {
          attemptId,
          studentId: attempt.studentId,
          quizId: attempt.quizId,
          score,
          maxScore,
          percentage,
          passed,
          gradedAt: new Date(),
        },
        update: { score, maxScore, percentage, passed, gradedAt: new Date() },
      }),
    ]);

    this.logger.log(
      `Attempt ${attemptId} scored: ${score}/${maxScore} (${percentage}%) — ${passed ? 'PASSED' : 'FAILED'}`,
    );

    const scored = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: { answers: true },
    });

    return this.toResponseDto(scored);
  }

  compareAnswer(
    selectedOptionId: string | null,
    correctAnswer: string | undefined,
  ): boolean | null {
    if (correctAnswer === undefined) return null;
    return selectedOptionId !== null && selectedOptionId === correctAnswer;
  }

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
