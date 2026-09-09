// src/modules/attempts/services/scoring.service.ts

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { GradingStatus, QuestionType } from '../../../generated/prisma/client';
import { AttemptResponseDto } from '../dto/attempt-response.dto';
import { normalizeShortText as normalizeShortTextValue } from '../utils/text-answer.util';
import { TransactionClient } from '../../../generated/prisma/internal/prismaNamespace';

interface QuestionMeta {
  id: string;
  type: QuestionType;
  correctAnswer: string;
  points: number;
}

interface GradedAnswerUpdate {
  answerId: string | null;
  questionId: string;
  isCorrect: boolean | null;
  pointsEarned: number | null;
}

interface AggregateScore {
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean | null;
  gradingStatus: GradingStatus;
  pendingEssayCount: number;
}

type PrismaOrTx = PrismaService | TransactionClient;

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  constructor(private readonly prisma: PrismaService) {}

  async scoreAttempt(
    attemptId: string,
    tx: PrismaOrTx = this.prisma,
  ): Promise<AttemptResponseDto> {
    const attempt = await tx.attempt.findUnique({
      where: { id: attemptId },
      include: { answers: true },
    });

    if (!attempt) throw new NotFoundException('Attempt not found.');

    const [questionMap, maxScore, quiz] = await this.loadQuizContext(
      attempt.quizId,
      tx,
    );

    const answerMap = new Map(
      attempt.answers.map((answer) => [answer.questionId, answer]),
    );
    const graded: GradedAnswerUpdate[] = [];
    for (const [questionId, question] of questionMap) {
      const answer = answerMap.get(questionId);
      if (answer) {
        graded.push(this.gradeAnswer(answer, question));
      } else {
        const syntheticAnswer = {
          id: null, // no real row — nothing to write back to
          questionId,
          selectedOptionId: null,
          textAnswer: null,
        };
        graded.push(this.gradeAnswer(syntheticAnswer, question));
      }
    }

    const aggregate = this.aggregateFromAnswers(
      graded,
      questionMap,
      maxScore,
      quiz?.passingScore ?? 50,
    );

    return this.persistScore(attempt, graded, aggregate, true, tx);
  }

  async recalculateAttemptResult(
    attemptId: string,
  ): Promise<AttemptResponseDto> {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: { answers: true },
    });

    if (!attempt) throw new NotFoundException('Attempt not found.');

    const [questionMap, maxScore, quiz] = await this.loadQuizContext(
      attempt.quizId,
    );

    const aggregate = this.aggregateFromStoredAnswers(
      attempt.answers,
      questionMap,
      maxScore,
      quiz?.passingScore ?? 50,
    );

    return this.persistScore(attempt, [], aggregate, false);
  }

  compareAnswer(
    selectedOptionId: string | null,
    correctAnswer: string | undefined,
  ): boolean | null {
    if (correctAnswer === undefined) return null;
    return selectedOptionId !== null && selectedOptionId === correctAnswer;
  }

  compareShortText(
    textAnswer: string | null | undefined,
    correctAnswer: string | undefined,
  ): boolean {
    if (!textAnswer?.trim() || correctAnswer === undefined) return false;
    return (
      this.normalizeShortText(textAnswer) ===
      this.normalizeShortText(correctAnswer)
    );
  }

  normalizeShortText(value: string): string {
    return normalizeShortTextValue(value);
  }

  computePercentage(score: number, maxScore: number): number {
    if (maxScore === 0) return 0;
    return Math.round((score / maxScore) * 100 * 100) / 100;
  }

  private async loadQuizContext(
    quizId: string,
    tx: PrismaOrTx = this.prisma,
  ): Promise<
    [Map<string, QuestionMeta>, number, { passingScore: number | null } | null]
  > {
    const [allQuestions, quiz] = await Promise.all([
      tx.question.findMany({
        where: {
          quizQuestions: {
            some: { quizId },
          },
        },
        select: { id: true, type: true, correctAnswer: true, points: true },
      }),
      tx.quiz.findUnique({
        where: { id: quizId },
        select: { passingScore: true },
      }),
    ]);

    const questionMap = new Map(allQuestions.map((q) => [q.id, q]));
    const maxScore = allQuestions.reduce((sum, q) => sum + q.points, 0);

    return [questionMap, maxScore, quiz];
  }

  private gradeAnswer(
    answer: {
      id: string | null;
      questionId: string;
      selectedOptionId: string | null;
      textAnswer: string | null;
    },
    question: QuestionMeta,
  ): GradedAnswerUpdate {
    switch (question.type) {
      case QuestionType.MCQ:
      case QuestionType.TRUE_FALSE: {
        const isCorrect =
          this.compareAnswer(
            answer.selectedOptionId,
            question.correctAnswer,
          ) === true;
        return {
          answerId: answer.id,
          questionId: answer.questionId,
          isCorrect,
          pointsEarned: isCorrect ? question.points : 0,
        };
      }
      case QuestionType.SHORT_TEXT: {
        const isCorrect = this.compareShortText(
          answer.textAnswer,
          question.correctAnswer,
        );
        return {
          answerId: answer.id,
          questionId: answer.questionId,
          isCorrect,
          pointsEarned: isCorrect ? question.points : 0,
        };
      }
      case QuestionType.ESSAY: {
        const hasText = Boolean(answer.textAnswer?.trim());
        if (!hasText) {
          return {
            answerId: answer.id,
            questionId: answer.questionId,
            isCorrect: false,
            pointsEarned: 0,
          };
        }
        return {
          answerId: answer.id,
          questionId: answer.questionId,
          isCorrect: null, // still the "pending" signal
          pointsEarned: 0, // changed from null — placeholder until manually graded
        };
      }
      default:
        return {
          answerId: answer.id,
          questionId: answer.questionId,
          isCorrect: null,
          pointsEarned: null,
        };
    }
  }

  private aggregateFromAnswers(
    graded: GradedAnswerUpdate[],
    questionMap: Map<string, QuestionMeta>,
    maxScore: number,
    passingThreshold: number,
  ): AggregateScore {
    let score = 0;
    let pendingEssayCount = 0;

    for (const item of graded) {
      const question = questionMap.get(item.questionId);
      if (!question) continue;

      if (item.pointsEarned !== null) {
        score += item.pointsEarned;
      }

      if (question.type === QuestionType.ESSAY && item.isCorrect === null) {
        pendingEssayCount += 1;
      }
    }

    const gradingStatus =
      pendingEssayCount > 0 ? GradingStatus.PARTIAL : GradingStatus.COMPLETE;
    const percentage = this.computePercentage(score, maxScore);
    const passed =
      gradingStatus === GradingStatus.COMPLETE
        ? percentage >= passingThreshold
        : null;

    return {
      score,
      maxScore,
      percentage,
      passed,
      gradingStatus,
      pendingEssayCount,
    };
  }

  private aggregateFromStoredAnswers(
    answers: Array<{
      id: string;
      questionId: string;
      textAnswer: string | null;
      pointsEarned: number | null;
      isCorrect: boolean | null;
    }>,
    questionMap: Map<string, QuestionMeta>,
    maxScore: number,
    passingThreshold: number,
  ): AggregateScore {
    let score = 0;
    let pendingEssayCount = 0;

    for (const answer of answers) {
      const question = questionMap.get(answer.questionId);
      if (!question) continue;

      if (answer.pointsEarned !== null) {
        score += answer.pointsEarned;
      }

      if (
        question.type === QuestionType.ESSAY &&
        Boolean(answer.textAnswer?.trim()) &&
        answer.isCorrect === null
      ) {
        pendingEssayCount += 1;
      }
    }

    const gradingStatus =
      pendingEssayCount > 0 ? GradingStatus.PARTIAL : GradingStatus.COMPLETE;
    const percentage = this.computePercentage(score, maxScore);
    const passed =
      gradingStatus === GradingStatus.COMPLETE
        ? percentage >= passingThreshold
        : null;

    return {
      score,
      maxScore,
      percentage,
      passed,
      gradingStatus,
      pendingEssayCount,
    };
  }

  private async persistScore(
    attempt: {
      id: string;
      quizId: string;
      studentId: string;
      answers: unknown[];
    },
    graded: GradedAnswerUpdate[],
    aggregate: AggregateScore,
    updateAnswers = true,
    tx: PrismaOrTx = this.prisma,
  ): Promise<AttemptResponseDto> {
    const transactions = [];
    const answeredGraded = graded.filter(
      (g): g is GradedAnswerUpdate & { answerId: string } =>
        g.answerId !== null,
    );

    if (updateAnswers && graded.length > 0) {
      transactions.push(
        ...answeredGraded.map((g) =>
          tx.attemptAnswer.update({
            where: { id: g.answerId },
            data: {
              isCorrect: g.isCorrect,
              pointsEarned: g.pointsEarned,
            },
          }),
        ),
      );
    }

    transactions.push(
      tx.attempt.update({
        where: { id: attempt.id },
        data: { score: aggregate.score, maxScore: aggregate.maxScore },
      }),
      tx.result.upsert({
        where: { attemptId: attempt.id },
        create: {
          attemptId: attempt.id,
          studentId: attempt.studentId,
          quizId: attempt.quizId,
          score: aggregate.score,
          maxScore: aggregate.maxScore,
          percentage: aggregate.percentage,
          passed: aggregate.passed,
          gradingStatus: aggregate.gradingStatus,
          pendingEssayCount: aggregate.pendingEssayCount,
          gradedAt: new Date(),
        },
        update: {
          score: aggregate.score,
          maxScore: aggregate.maxScore,
          percentage: aggregate.percentage,
          passed: aggregate.passed,
          gradingStatus: aggregate.gradingStatus,
          pendingEssayCount: aggregate.pendingEssayCount,
          gradedAt: new Date(),
        },
      }),
    );

    if (tx === this.prisma) {
      // Standalone call — wrap these writes in their own transaction.
      await this.prisma.$transaction(transactions);
    } else {
      // Already running inside an outer transaction — just execute directly.
      for (const t of transactions) {
        await t;
      }
    }

    this.logger.log(
      `Attempt ${attempt.id} scored: ${aggregate.score}/${aggregate.maxScore} (${aggregate.percentage}%) — ${aggregate.gradingStatus}${aggregate.passed === true ? ' PASSED' : aggregate.passed === false ? ' FAILED' : ' PENDING ESSAYS'}`,
    );

    const scored = await tx.attempt.findUnique({
      where: { id: attempt.id },
      include: { answers: true },
    });

    return this.toResponseDto(scored);
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
        textAnswer: a.textAnswer,
        pointsEarned: a.pointsEarned,
        isCorrect: a.isCorrect,
        answeredAt: a.answeredAt,
      })),
    };
  }
}
