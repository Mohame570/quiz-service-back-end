import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttemptStatus,
  QuestionType,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ScoringService } from '../../attempts/services/scoring.service';
import {
  GradingAttemptDetailDto,
  GradingAttemptSummaryDto,
  GradingQueueResponseDto,
} from '../dto/grading-response.dto';

@Injectable()
export class AnalyticsGradingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoringService: ScoringService,
  ) {}

  async getGradingQueue(quizId?: string): Promise<GradingQueueResponseDto> {
    const results = await this.prisma.result.findMany({
      where: {
        gradingStatus: 'PARTIAL',
        pendingEssayCount: { gt: 0 },
        ...(quizId ? { quizId } : {}),
      },
      include: {
        attempt: {
          select: {
            id: true,
            submittedAt: true,
            score: true,
            maxScore: true,
            student: {
              select: {
                user: { select: { email: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: { gradedAt: 'asc' },
    });

    const quizIds = [...new Set(results.map((r) => r.quizId))];
    const quizzes = await this.prisma.quiz.findMany({
      where: { id: { in: quizIds } },
      select: { id: true, title: true },
    });
    const titleById = new Map(quizzes.map((q) => [q.id, q.title]));

    const items: GradingAttemptSummaryDto[] = results.map((result) => ({
      attemptId: result.attemptId,
      quizId: result.quizId,
      quizTitle: titleById.get(result.quizId) ?? 'Unknown Quiz',
      studentEmail: result.attempt.student.user.email,
      studentName: result.attempt.student.user.name,
      submittedAt: result.attempt.submittedAt,
      pendingEssayCount: result.pendingEssayCount,
      currentScore: result.score,
      maxScore: result.maxScore,
    }));

    return { items };
  }

  async getGradingAttempt(attemptId: string): Promise<GradingAttemptDetailDto> {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        answers: {
          include: {
            question: {
              select: {
                id: true,
                type: true,
                text: true,
                points: true,
                order: true,
              },
            },
          },
          orderBy: { question: { order: 'asc' } },
        },
        result: true,
        student: {
          select: {
            user: { select: { email: true, name: true } },
          },
        },
        quiz: { select: { id: true, title: true, passingScore: true } },
      },
    });

    if (!attempt) {
      throw new NotFoundException('Attempt not found.');
    }

    return {
      attemptId: attempt.id,
      quizId: attempt.quizId,
      quizTitle: attempt.quiz.title,
      passingScore: attempt.quiz.passingScore,
      studentEmail: attempt.student.user.email,
      studentName: attempt.student.user.name,
      status: attempt.status,
      submittedAt: attempt.submittedAt,
      score: attempt.score,
      maxScore: attempt.maxScore,
      result: attempt.result
        ? {
            percentage: attempt.result.percentage,
            passed: attempt.result.passed,
            gradingStatus: attempt.result.gradingStatus,
            pendingEssayCount: attempt.result.pendingEssayCount,
            gradedAt: attempt.result.gradedAt,
          }
        : null,
      answers: attempt.answers.map((answer) => ({
        id: answer.id,
        questionId: answer.questionId,
        questionType: answer.question.type,
        questionText: answer.question.text,
        maxPoints: answer.question.points,
        selectedOptionId: answer.selectedOptionId,
        textAnswer: answer.textAnswer,
        pointsEarned: answer.pointsEarned,
        isCorrect: answer.isCorrect,
        gradedAt: answer.gradedAt,
        answeredAt: answer.answeredAt,
        pendingManualGrade:
          answer.question.type === QuestionType.ESSAY &&
          Boolean(answer.textAnswer?.trim()) &&
          answer.pointsEarned === null,
      })),
    };
  }

  async gradeEssayAnswer(
    attemptId: string,
    answerId: string,
    pointsEarned: number,
    adminId: string,
  ) {
    const answer = await this.prisma.attemptAnswer.findFirst({
      where: { id: answerId, attemptId },
      include: {
        question: { select: { type: true, points: true } },
        attempt: { select: { status: true } },
      },
    });

    if (!answer) {
      throw new NotFoundException('Answer not found for this attempt.');
    }

    if (answer.attempt.status !== AttemptStatus.SUBMITTED) {
      throw new BadRequestException(
        'Only submitted attempts can be manually graded.',
      );
    }

    if (answer.question.type !== QuestionType.ESSAY) {
      throw new BadRequestException('Only ESSAY answers can be manually graded.');
    }

    if (pointsEarned < 0 || pointsEarned > answer.question.points) {
      throw new BadRequestException(
        `pointsEarned must be between 0 and ${answer.question.points}.`,
      );
    }

    const isCorrect = pointsEarned === answer.question.points;

    await this.prisma.attemptAnswer.update({
      where: { id: answerId },
      data: {
        pointsEarned,
        isCorrect,
        gradedById: adminId,
        gradedAt: new Date(),
      },
    });

    return this.scoringService.recalculateAttemptResult(attemptId);
  }
}
